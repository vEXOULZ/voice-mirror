// Checks over the pure half, in the spirit of the offline tool's own.
// Run with: node --test
//
// Nothing here needs a browser, a microphone or a recording. The synthetic
// signals are built from stated formant and pitch values, so a failure says
// which stage broke rather than that something sounds wrong.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeTaps, decimate, detectPitch, bark, formants, vtl, semitones,
  centroid, median, sd, hull, createVowelTracker
} from "../js/dsp.js";
import { encodeWav, floatToInt16, int16ToFloat } from "../js/wav.js";
import { RMS_GATE, WORK_RATE, F0_FLOOR, F0_CEILING } from "../js/constants.js";
import { normalise, defaults, fromFile, toFile, hexToBand, bandToHex, PANELS } from "../js/settings.js";
import { parseReference, inBand } from "../js/reference.js";
import { synthVowel, upperFormants } from "../js/synth.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PAGES, headBlock, readVersion, listModules } from "../tools/stamp.mjs";

const RATE = WORK_RATE;   // the working rate everything downstream sees
const LEN = 1024;         // one analysis window, 4096 decimated by four

// A glottal-ish source: a sum of harmonics with 1/n amplitudes, which is close
// enough to a voice for a pitch tracker and gives the formant filter something
// to shape.
//
// The count runs to the Nyquist, and it has to. At twenty harmonics a 120 Hz
// source stops at 2400 Hz, so a formant at 2600 has nothing to ring and the
// tracker correctly reports the edge of the band instead. A source that does
// not cover the band cannot test what is in it.
const pulseTrain = (f0, rate, n, harmonics = 200) => {
  const x = new Float32Array(n);
  for (let h = 1; h <= harmonics; h++) {
    if (h * f0 >= rate / 2) break;
    for (let i = 0; i < n; i++) x[i] += Math.sin(2 * Math.PI * h * f0 * i / rate) / h;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (let i = 0; i < n; i++) x[i] /= peak || 1;
  return x;
};

// A two-pole resonator at f with bandwidth bw, the standard formant filter.
const resonate = (x, f, bw, rate) => {
  const r = Math.exp(-Math.PI * bw / rate), w = 2 * Math.PI * f / rate;
  const a1 = 2 * r * Math.cos(w), a2 = -r * r;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    y[i] = x[i] * (1 - a1 - a2) + (i > 0 ? a1 * y[i - 1] : 0) + (i > 1 ? a2 * y[i - 2] : 0);
  }
  return y;
};

// A vowel: a source through however many formants, normalised.
//
// Give it five, not three. LPC at order 12 fits five formants plus the
// spectral tilt, so a three-formant signal leaves it three spare pole pairs to
// put wherever the residual slope is, and one of those lands between F2 and F3
// and gets picked up as F3. That is the test signal being unrealistic, not the
// tracker being wrong: a voice has five.
const vowel = (f0, fs, rate = RATE, n = LEN, bws = null) => {
  let x = pulseTrain(f0, rate, n);
  fs.forEach((f, i) => { x = resonate(x, f, bws ? bws[i] : 80, rate); });
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (let i = 0; i < n; i++) x[i] = 0.6 * x[i] / (peak || 1);
  return x;
};

// --- decimation ----------------------------------------------------------

test("anti-alias taps are normalised to unity gain", () => {
  const t = makeTaps(48000);
  let sum = 0;
  for (const v of t) sum += v;
  assert.ok(Math.abs(sum - 1) < 1e-6, "taps sum to " + sum);
});

test("decimating a constant preserves it", () => {
  const buf = new Float32Array(4096).fill(0.5);
  const out = decimate(buf, 4, makeTaps(48000), new Float32Array(1024));
  // The edges taper because the filter runs off the end of the buffer, so the
  // middle is what carries the claim.
  assert.ok(Math.abs(out[512] - 0.5) < 1e-3, "middle sample is " + out[512]);
});

// --- pitch ---------------------------------------------------------------

test("pitch is found across the search range", () => {
  for (const f0 of [70, 98, 147, 220, 330, 440]) {
    const hz = detectPitch(pulseTrain(f0, RATE, LEN), RATE, RMS_GATE);
    assert.ok(hz != null, f0 + " Hz returned nothing");
    assert.ok(Math.abs(hz - f0) / f0 < 0.02, f0 + " Hz read as " + hz.toFixed(1));
  }
});

test("a high voice is not halved", () => {
  // 440 read as 220 before the NSDF was filled from lag 1: the top of a high
  // voice sat inside the lobe around zero and the scan stepped over it.
  const hz = detectPitch(pulseTrain(440, RATE, LEN), RATE, RMS_GATE);
  assert.ok(Math.abs(hz - 440) / 440 < 0.02, "440 Hz read as " + hz);
});

test("a weak subharmonic does not drag the reading an octave down", () => {
  // The octave trap OCTAVE_TOL guards: the correlation peak an octave below
  // what was produced is frequently the strongest one, so the first peak
  // within 90% of the best is taken instead of the best.
  //
  // Weak on purpose. A full harmonic series at half the rate is not a
  // subharmonic, it is a voice an octave lower, and calling that 200 Hz would
  // be the wrong answer rather than a robust one. One added component at 15%,
  // which is what a diplophonic voice does, is the case the guard is for.
  //
  // Measured here: the NSDF ratio between the true period and the octave below
  // crosses 0.9 between amplitudes of 0.15 and 0.20, so that is where this
  // tolerance gives out.
  const f0 = 200;
  const x = pulseTrain(f0, RATE, LEN);
  const mix = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) {
    mix[i] = x[i] + 0.15 * Math.sin(2 * Math.PI * (f0 / 2) * i / RATE);
  }
  const hz = detectPitch(mix, RATE, RMS_GATE);
  assert.ok(hz != null && Math.abs(hz - f0) / f0 < 0.05, "read as " + hz);
});

test("a quiet room is unvoiced, not a guess", () => {
  const x = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) x[i] = (Math.random() - 0.5) * 1e-4;
  assert.equal(detectPitch(x, RATE, RMS_GATE), null);
});

test("noise is unvoiced even when it is loud", () => {
  const x = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) x[i] = (Math.random() - 0.5) * 0.8;
  assert.equal(detectPitch(x, RATE, RMS_GATE), null);
});

test("the search stays inside its own range", () => {
  for (const f0 of [80, 300]) {
    const hz = detectPitch(pulseTrain(f0, RATE, LEN), RATE, RMS_GATE);
    assert.ok(hz >= F0_FLOOR && hz <= F0_CEILING);
  }
});

// --- formants ------------------------------------------------------------

test("formants come back where they were put", () => {
  // Three vowels with known poles, in the ranges the selection allows.
  for (const [name, f1, f2] of [["i", 300, 2200], ["a", 700, 1300], ["u", 350, 850]]) {
    const f = formants(vowel(120, [f1, f2, 2800, 3500, 4400]), RATE, null);
    assert.ok(f, name + " returned nothing");
    assert.ok(Math.abs(f[0] - f1) < 60, name + " F1 " + f[0].toFixed(0) + " want " + f1);
    assert.ok(Math.abs(f[1] - f2) < 120, name + " F2 " + f[1].toFixed(0) + " want " + f2);
  }
});

test("a wide F1 pole survives", () => {
  // The bug BW_MAX was widened from 400 to 500 for: on a real voice the true
  // F1's estimated bandwidth wanders either side of 400, and dropping it made
  // F2 be reported as F1 and the dot leap across the plane.
  const f = formants(vowel(120, [600, 1600, 2700, 3500, 4400], RATE, LEN, [450, 90, 110, 150, 200]), RATE, null);
  assert.ok(f, "returned nothing");
  assert.ok(Math.abs(f[0] - 600) < 80, "F1 came back as " + f[0].toFixed(0));
  assert.ok(f[1] > 1200, "F2 came back as " + f[1].toFixed(0) + ", which looks like F1 was lost");
});

test("F2 is the next resonance up, not the narrowest pole up", () => {
  // A narrow high pole used to win on bandwidth alone and be called F2.
  const f = formants(vowel(120, [500, 1558, 2600, 3500, 4400], RATE, LEN, [90, 130, 40, 150, 200]), RATE, null);
  assert.ok(f, "returned nothing");
  assert.ok(Math.abs(f[1] - 1558) < 150, "F2 came back as " + f[1].toFixed(0));
});

test("a test vowel is heard back where it was asked for", () => {
  // The whole path a click takes: synthesised at a playback rate, decimated
  // the way the analyser's frames are, then tracked. If this drifts, the dot
  // stops landing on the crosshair.
  const rate = 48000, dec = Math.round(rate / WORK_RATE), taps = makeTaps(rate);
  for (const [f0, f1, f2] of [[120, 300, 2200], [200, 700, 1300], [180, 350, 850], [250, 500, 1800]]) {
    const x = synthVowel({ f0, f1, f2, rate });
    const w = decimate(x.subarray(rate / 2, rate / 2 + 4096), dec, taps, new Float32Array(Math.floor(4096 / dec)));
    const hz = detectPitch(w, rate / dec, RMS_GATE);
    const f = formants(w, rate / dec, null);
    const at = f0 + "/" + f1 + "/" + f2;
    assert.ok(hz && Math.abs(hz - f0) < 2, at + " pitch came back as " + hz);
    assert.ok(f && Math.abs(f[0] - f1) < 60, at + " F1 came back as " + (f && f[0]));
    assert.ok(f && Math.abs(f[1] - f2) < 120, at + " F2 came back as " + (f && f[1]));
  }
});

// The same path, over a whole held vowel: the median of every analysis window
// past the onset, the way the page's own comparison reads a click.
const heardOver = (x, rate) => {
  const dec = Math.round(rate / WORK_RATE), taps = makeTaps(rate);
  const hz = [], f1 = [], f2 = [], f3 = [];
  for (let at = Math.round(0.3 * rate); at + 4096 < x.length - 0.2 * rate; at += 2400) {
    const w = decimate(x.subarray(at, at + 4096), dec, taps, new Float32Array(Math.floor(4096 / dec)));
    const p = detectPitch(w, rate / dec, RMS_GATE);
    const f = formants(w, rate / dec, null);
    if (p != null) hz.push(p);
    if (f) { f1.push(f[0]); f2.push(f[1]); if (f[2] != null) f3.push(f[2]); }
  }
  return { hz: median(hz), f1: median(f1), f2: median(f2), f3: median(f3), voiced: hz.length };
};

// A seeded generator, so the natural voice is the same on every run.
const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test("a natural test vowel is still heard back where it was asked for", () => {
  const rate = 48000;
  for (const [f0, f1, f2] of [[120, 300, 2200], [200, 700, 1300], [180, 350, 850], [250, 500, 1800]]) {
    const h = heardOver(synthVowel({ f0, f1, f2, natural: true, rate, random: seeded(7) }), rate);
    const at = f0 + "/" + f1 + "/" + f2;
    assert.ok(h.voiced >= 15, at + " pitch was found in only " + h.voiced + " windows");
    assert.ok(Math.abs(h.hz - f0) < f0 * 0.03, at + " pitch came back as " + h.hz);
    assert.ok(Math.hypot(bark(h.f1) - bark(f1), bark(h.f2) - bark(f2)) < 0.5,
              at + " came back as " + h.f1.toFixed(0) + "/" + h.f2.toFixed(0));
  }
});

test("the vocal tract length asked for is the length read back", () => {
  const rate = 48000;
  for (const tract of [14, 17]) {
    const [f3] = upperFormants(500, 1500, tract);
    assert.ok(Math.abs(vtl(500, f3) - tract) < 1e-9, "placed F3 gives " + vtl(500, f3));
    const h = heardOver(synthVowel({ f0: 180, f1: 500, f2: 1500, tract, rate }), rate);
    assert.ok(Math.abs(vtl(h.f1, h.f3) - tract) < 1, tract + " cm read back as " + vtl(h.f1, h.f3).toFixed(1));
  }
  assert.ok(upperFormants(300, 2400, 17)[0] >= 2700, "F3 must clear a high F2");
});

test("a test vowel fades in and out and stays under full scale", () => {
  const x = synthVowel({ f0: 180, f1: 500, f2: 1500, seconds: 0.5, rate: 48000 });
  assert.equal(x.length, 24000);
  assert.ok(Math.abs(x[0]) < 0.01 && Math.abs(x[x.length - 1]) < 0.01, "the ends must be near silent");
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 0.5 + 1e-6 && peak > 0.4, "peak " + peak);
});

test("silence yields no formants", () => {
  assert.equal(formants(new Float32Array(LEN), RATE, null), null);
});

test("F3 rides along without choosing F1 and F2", () => {
  const f = formants(vowel(120, [500, 1500, 2600, 3500, 4400]), RATE, null);
  assert.ok(f[2] != null && Math.abs(f[2] - 2600) < 200, "F3 came back as " + f[2]);
});

// --- derived figures -----------------------------------------------------

test("bark follows Traunmuller", () => {
  assert.ok(Math.abs(bark(1000) - (26.81 * 1000 / 2960 - 0.53)) < 1e-9);
  assert.ok(bark(2000) > bark(1000) && bark(500) < bark(1000));
});

test("vocal tract length is the formant spacing", () => {
  assert.ok(Math.abs(vtl(500, 2500) - 35000 / 2000) < 1e-9);
  assert.equal(vtl(500, 400), null, "inverted formants must not return a length");
  assert.equal(vtl(null, 2500), null);
});

test("semitones are measured from the shared reference", () => {
  assert.ok(Math.abs(semitones(100)) < 1e-12);
  assert.ok(Math.abs(semitones(200) - 12) < 1e-12);
});

test("the centroid sits where the energy is", () => {
  // 512 bins over a 24 kHz Nyquist: one loud bin at 2 kHz and silence around
  // it puts the centre of mass on that bin.
  const n = 512, nyq = 24000;
  const db = new Float32Array(n).fill(-140);
  const at = Math.round(2000 / nyq * n);
  db[at] = 0;
  const c = centroid(db, 48000);
  assert.ok(Math.abs(c - at * nyq / n) < 30, "centroid at " + c);
});

test("median and sd behave", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.ok(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 1e-12);
  assert.equal(sd([1]), null);
});

test("the hull is the boundary, and ignores the inside", () => {
  const square = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }];
  assert.equal(hull(square).length, 4);
  assert.equal(hull(square.concat([{ x: 0.5, y: 0.5 }])).length, 4);
  const area = pts => {
    const h = hull(pts);
    let a = 0;
    for (let i = 0; i < h.length; i++) {
      const p = h[i], q = h[(i + 1) % h.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  };
  assert.ok(Math.abs(area(square) - 1) < 1e-12);
});

// --- the vowel tracker ---------------------------------------------------

const FRAME_MS = 1000 / 30;

test("a held vowel becomes steady and moves the dot", () => {
  const t = createVowelTracker();
  for (let i = 0; i < 10; i++) t.push([500 + (i % 2), 1500 - (i % 2), 2600], i * FRAME_MS);
  assert.ok(t.steady, "a rock-steady vowel was not called steady");
  assert.ok(t.target, "steady frames never moved the dot");
  assert.ok(Math.abs(t.target[0] - 500) < 5);
});

test("a glide is not a vowel", () => {
  const t = createVowelTracker();
  // 40 Hz of F1 movement per frame is well past the drift limit over 60 ms.
  for (let i = 0; i < 10; i++) t.push([400 + i * 40, 1200 + i * 90, 2600], i * FRAME_MS);
  assert.equal(t.steady, false, "a moving formant pair was called a vowel");
});

test("losing voicing breaks the path rather than joining across it", () => {
  const t = createVowelTracker();
  for (let i = 0; i < 6; i++) t.push([500, 1500, 2600], i * FRAME_MS);
  t.push(null, 6 * FRAME_MS);
  for (let i = 7; i < 13; i++) t.push([700, 1200, 2500], i * FRAME_MS);
  assert.ok(t.trail.includes(null), "the trail joined across a silence");
  assert.equal(t.steady, true);
});

test("the dot eases toward the vowel rather than jumping to it", () => {
  const t = createVowelTracker();
  for (let i = 0; i < 6; i++) t.push([500, 1500, 2600], i * FRAME_MS);
  t.glide();
  const first = t.smooth.slice();
  for (let i = 6; i < 12; i++) t.push([800, 1200, 2500], i * FRAME_MS);
  t.glide();
  assert.ok(t.smooth[0] > first[0], "the dot did not move toward the new vowel");
  assert.ok(t.smooth[0] < 800, "the dot jumped straight to it");
});

test("reset clears the figures", () => {
  const t = createVowelTracker();
  for (let i = 0; i < 6; i++) t.push([500, 1500, 2600], i * FRAME_MS);
  t.glide();
  t.reset();
  assert.equal(t.now, null);
  assert.equal(t.target, null);
  assert.equal(t.smooth, null);
  assert.equal(t.steady, false);
  assert.equal(t.trail.length, 0);
});

// --- the WAV encoder -----------------------------------------------------

test("the WAV header says mono 16-bit at the rate it was given", () => {
  const n = 480;
  const buf = encodeWav(new Float32Array(n), 48000);
  const v = new DataView(buf);
  const str = (at, len) => {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(v.getUint8(at + i));
    return s;
  };
  assert.equal(str(0, 4), "RIFF");
  assert.equal(v.getUint32(4, true), 36 + n * 2, "RIFF size");
  assert.equal(str(8, 8), "WAVEfmt ");
  assert.equal(v.getUint32(16, true), 16, "fmt chunk size");
  assert.equal(v.getUint16(20, true), 1, "PCM");
  assert.equal(v.getUint16(22, true), 1, "mono");
  assert.equal(v.getUint32(24, true), 48000, "sample rate");
  assert.equal(v.getUint32(28, true), 96000, "byte rate");
  assert.equal(v.getUint16(32, true), 2, "block align");
  assert.equal(v.getUint16(34, true), 16, "bits");
  assert.equal(str(36, 4), "data");
  assert.equal(v.getUint32(40, true), n * 2, "data size");
  assert.equal(buf.byteLength, 44 + n * 2);
});

test("samples survive the round trip, and clip rather than wrap", () => {
  const x = new Float32Array([0, 0.5, -0.5, 1, -1, 1.7, -1.7]);
  const back = int16ToFloat([floatToInt16(x)]);
  assert.ok(Math.abs(back[1] - 0.5) < 1e-4);
  assert.ok(Math.abs(back[2] + 0.5) < 1e-4);
  assert.ok(back[5] > 0.99, "a sample over 1 wrapped instead of clipping");
  assert.ok(back[6] < -0.99, "a sample under -1 wrapped instead of clipping");
});

test("the encoder writes the samples it was given", () => {
  const buf = encodeWav(new Float32Array([0, 0.5, -0.5]), 8000);
  const v = new DataView(buf);
  assert.equal(v.getInt16(44, true), 0);
  assert.equal(v.getInt16(46, true), Math.trunc(0.5 * 0x7fff));
  assert.equal(v.getInt16(48, true), Math.round(-0.5 * 0x8000));
});

// --- settings ------------------------------------------------------------


test("settings fall back field by field, not all at once", () => {
  const s = normalise({ theme: "neon", panels: { pitch: false, nonsense: true },
                        bands: [{ name: "x", low: 200, high: 100 }, { name: "ok", low: 90, high: 150 }] });
  assert.equal(s.theme, "system", "an unknown theme fell through");
  assert.equal(s.panels.pitch, false, "a valid panel choice was lost");
  assert.ok(!("nonsense" in s.panels), "an unknown panel was kept");
  assert.equal(s.bands.length, 1, "an inverted band was kept");
  assert.equal(s.bands[0].name, "ok");
});

test("settings with nothing usable are the defaults", () => {
  assert.deepEqual(normalise(null), defaults());
  assert.deepEqual(normalise("garbage"), defaults());
  assert.equal(normalise({ bands: [] }).bands, null, "an empty band list must mean 'use the reference's'");
});

test("test vowel settings keep to their ranges", () => {
  const d = defaults();
  assert.equal(d.toneTract, 17);
  assert.equal(d.toneNatural, false);
  assert.equal(normalise({ toneTract: 14.2 }).toneTract, 14, "rounded to the slider's half steps");
  assert.equal(normalise({ toneTract: 40 }).toneTract, 17, "out of range falls back");
  assert.equal(normalise({ toneNatural: true }).toneNatural, true);
});

test("the outside-every-band meter is off unless turned on", () => {
  assert.equal(defaults().showOutside, false);
  assert.equal(normalise({ showOutside: true }).showOutside, true);
  assert.equal(normalise({ showOutside: "yes" }).showOutside, false, "only a real boolean turns it on");
});

test("every panel has a default", () => {
  const d = defaults();
  for (const [k] of PANELS) assert.equal(typeof d.panels[k], "boolean", k);
});

test("settings survive export and import", () => {
  const s = normalise({ theme: "dark", panels: { vtl: true },
                        bands: [{ name: "a", low: 80, high: 140, color: "rgba(1, 2, 3, 0.14)" }],
                        reference: { vowel_reference: [] } });
  const back = fromFile(toFile(s));
  assert.equal(back.theme, "dark");
  assert.equal(back.panels.vtl, true);
  assert.deepEqual(back.bands, s.bands);
  assert.deepEqual(back.reference, s.reference);
});

test("a reference file handed to Import is named as one", () => {
  assert.throws(() => fromFile(JSON.stringify({ vowel_reference: [], pitch_bands: [] })),
                /reference file/);
  assert.throws(() => fromFile("{nope"), /not JSON/);
});

test("band colours round-trip through the colour input", () => {
  assert.equal(bandToHex(hexToBand("#6a9fb5")), "#6a9fb5");
  assert.match(hexToBand("#6a9fb5"), /rgba\(106, 159, 181, 0\.14\)/);
  assert.equal(bandToHex("not a colour"), "#969696", "unparseable must come back grey, not black");
});

// --- reference files -----------------------------------------------------

test("a reference drops a half-parsed row and names it", () => {
  const r = parseReference(JSON.stringify({ vowel_reference: [
    { lang: "pt", vowel: "i", word: "i", m_f1: 285, m_f2: 2198, w_f1: 307, w_f2: 2676 },
    { lang: "pt", vowel: "bad", word: "x", m_f1: 0, m_f2: null, w_f1: "x", w_f2: 1 }
  ] }));
  assert.equal(r.vowels.length, 1);
  assert.deepEqual(r.dropped, ["bad"]);
});

test("a reference with nothing drawable is refused, not drawn empty", () => {
  assert.throws(() => parseReference(JSON.stringify({ pitch_bands: [], vowel_reference: [] })), /no usable/);
  assert.throws(() => parseReference("{nope"), /not JSON/);
});

test("each band counts on its own, so overlapping bands both take a pitch", () => {
  const male = { low: 80, high: 180 }, female = { low: 165, high: 255 };
  assert.ok(inBand(170, male, F0_CEILING) && inBand(170, female, F0_CEILING), "170 is in both");
  assert.ok(inBand(80, male, F0_CEILING), "the low edge is inside");
  assert.ok(!inBand(180, male, F0_CEILING), "the high edge belongs to the band above");
  assert.ok(inBand(F0_CEILING, { low: 275, high: F0_CEILING }, F0_CEILING), "the top of the range is kept");
});

test("a band's shade flag survives settings, and is on unless turned off", () => {
  const s = normalise({ bands: [{ low: 60, high: 80, shade: false }, { low: 80, high: 140 }] });
  assert.equal(s.bands[0].shade, false);
  assert.equal(s.bands[1].shade, true);
  const r = parseReference(JSON.stringify({ pitch_bands: [{ low: 60, high: 80, shade: false }] }));
  assert.equal(r.bands[0].shade, false);
});

// --- publishing ----------------------------------------------------------

test("every page carries the current stamp, covering every module", () => {
  // Fails when a module was added, or a page edited, without running
  // node tools/stamp.mjs. A page missing from the map would load unversioned
  // and could be served stale beside fresh files.
  const v = readVersion();
  for (const page of PAGES) {
    const html = readFileSync(join(ROOT, page), "utf8");
    assert.ok(html.includes(headBlock(v)), page + " is not stamped with " + v + "; run node tools/stamp.mjs");
    for (const m of html.matchAll(/<script type="module" src="([^"]+)"/g)) {
      assert.ok(m[1].endsWith("?v=" + v), page + " loads " + m[1] + " without the version");
    }
  }
  assert.ok(listModules().includes("js/version.js"));
});
