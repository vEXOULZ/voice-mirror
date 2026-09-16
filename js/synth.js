// A test vowel: a pitch and a place on the vowel plane, turned into sound.
//
// The classic cascade formant synthesiser, cut down to what a test tone needs.
// A pulse train at the pitch, shaped by a glottal low-pass, run through five
// resonators in series, then differentiated for radiation from the lips. The
// source falls 12 dB an octave and radiation lifts 6 back, which is the tilt a
// real voice has, so the analysis meets something like what it was built for.
//
// It runs as a stream, a block at a time, because the same code serves two
// places: the audio thread, where worklet/voice.js drives it live while a
// pointer drags across the plane, and synthVowel below, which renders a fixed
// vowel for the tests. Nothing here touches a browser, and the only import is
// the constants, so the worklet can load it as it is.

import { SOUND_SPEED, TONE_TRACT } from "./constants.js";

// Where the formants the plane does not show sit, from the vocal tract length.
//
// F3 is placed so the page's own length estimate, c / (F3 - F1), reads back
// the length asked for. It is pushed up if that would crowd F2, since a front
// vowel's F2 climbs towards F3 and two resonances cannot share a place. F4 and
// F5 scale with the tract too. Without them LPC fits its spare poles to the
// tilt and can hand one back as a formant that is not there.
export const upperFormants = (f1, f2, tract = TONE_TRACT) => {
  const k = TONE_TRACT / tract;
  const f3 = Math.min(4400, Math.max(f1 + SOUND_SPEED / tract, f2 + 300));
  const f4 = Math.max(f3 + 700 * k, 3500 * k);
  return [f3, f4, f4 + 1000 * k];
};

// Bandwidths in Hz, widening with frequency the way measured vowels do.
const BANDWIDTHS = [70, 100, 130, 180, 250];

const BLOCK = 128;               // how often the formants are retuned while gliding
const GLIDE_S = 0.03;            // time constant a dragged formant follows the pointer with
const LEVEL = 0.12;              // RMS the output settles to
const ATTACK_S = 0.015, RELEASE_S = 0.03;

// The natural voice: how far from a perfect buzz. Up to 1% period jitter and
// 6% amplitude shimmer, cycle to cycle, a shallow waver in pitch, and a little
// breath. Tuned on 2026-09-16 against the page's own analysis: together they
// bring the harmonics-to-noise ratio from 26-32 dB down to 13-16, rougher
// than the buzz and about a healthy speaking voice, while pitch and formants
// still track on every test vowel. Breath at 0.03 took it to 10 dB and lost
// the pitch of a 300 Hz vowel entirely, so this is near the edge.
const JITTER = 0.01, SHIMMER = 0.06, VIBRATO_HZ = 4.8, VIBRATO_DEPTH = 0.008, BREATH = 0.015;

// The digital resonator, y = A x + B y1 + C y2, at unity gain at 0 Hz, so a
// cascade of them keeps the formants' relative levels right without tuning.
// Retuning keeps its state, so a formant can move without a click.
const resonator = rate => {
  let A = 1, B = 0, C = 0, y1 = 0, y2 = 0;
  return {
    tune(f, bw) {
      const T = 1 / rate;
      C = -Math.exp(-2 * Math.PI * bw * T);
      B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
      A = 1 - B - C;
    },
    step(x) { const y = A * x + B * y1 + C * y2; y2 = y1; y1 = y; return y; }
  };
};

// `random` is there for the tests, which need the natural voice to come out
// the same every run.
export const createVoice = (rate, random = Math.random) => {
  const nyq = rate / 2 * 0.9;
  const glottis = resonator(rate);
  glottis.tune(0, 100);
  const stages = BANDWIDTHS.map(() => resonator(rate));

  const want = { f0: 180, fs: [500, 1500, ...upperFormants(500, 1500)], natural: false, gate: false };
  const cur = { f0: want.f0, fs: want.fs.slice() };
  const retune = () => stages.forEach((s, i) => s.tune(Math.min(nyq, cur.fs[i]), BANDWIDTHS[i]));
  retune();

  let phase = 0, carry = 0, prev = 0, t = 0;
  let jf = 1, amp = 1;                       // this period's jitter and shimmer
  let power = 0, gain = 0, env = 0, raw = 0;
  const powA = 1 / (0.1 * rate), gainA = 1 / (0.05 * rate);
  const attack = 1 / (ATTACK_S * rate), release = 1 / (RELEASE_S * rate);
  const glide = Math.exp(-BLOCK / (GLIDE_S * rate));

  const sample = () => {
    let f0 = cur.f0 * jf;
    if (want.natural) {
      t += 1 / rate;
      f0 *= 1 + VIBRATO_DEPTH * Math.sin(2 * Math.PI * VIBRATO_HZ * t);
    }
    // The pulse lands between samples, split across the two either side of
    // where it falls. Rounded to a whole sample the period would wobble by one
    // sample in every few, and the pitch trace would show it.
    let src = carry;
    carry = 0;
    const step = f0 / rate;
    phase += step;
    if (phase >= 1) {
      phase -= 1;
      const frac = Math.min(1, phase / step);
      src += (1 - frac) * amp;
      carry = frac * amp;
      jf = want.natural ? 1 + (random() * 2 - 1) * JITTER : 1;
      amp = want.natural ? 1 + (random() * 2 - 1) * SHIMMER : 1;
    }

    let g = glottis.step(src);
    // Breath is noise at the glottis, riding on the airflow: it is loudest
    // while the folds are open and near silent while they are shut, as
    // aspiration is. Flat noise added beside the pulses was tried first, and
    // at any level that could be heard it drowned the periodicity the pitch
    // tracker needs. Riding on the flow it stays periodic, and goes through
    // the same formants, so it colours the vowel instead of hissing beside it.
    if (want.natural) g *= 1 + (random() * 2 - 1) * BREATH;

    let y = g;
    for (const s of stages) y = s.step(y);
    const out = y - prev;                  // radiation at the lips
    prev = y;
    raw = out;

    // Level is held by a slow automatic gain, measured before the gate, so it
    // is already settled when the sound opens. A fixed gain would not do: the
    // filter's output level swings by orders of magnitude with pitch and vowel.
    power += (out * out - power) * powA;
    gain += (LEVEL / Math.sqrt(power + 1e-24) - gain) * gainA;
    env = want.gate ? Math.min(1, env + attack) : Math.max(0, env - release);
    return Math.max(-1, Math.min(1, out * gain * env));
  };

  const voice = {};

  // Every field optional. F1 and F2 come together, since the upper formants
  // are placed from both.
  voice.set = p => {
    if (p.f0 != null) want.f0 = p.f0;
    if (p.f1 != null && p.f2 != null) want.fs = [p.f1, p.f2, ...upperFormants(p.f1, p.f2, p.tract)];
    if (p.natural != null) want.natural = !!p.natural;
    if (p.gate != null) {
      // Opening from silence jumps straight to the new place instead of
      // gliding in from wherever the last sound was, and runs the gain in
      // silently so the first milliseconds are not too loud or too quiet.
      if (p.gate && !want.gate && env === 0) {
        cur.f0 = want.f0; cur.fs = want.fs.slice(); retune();
        // The gain is seeded from a measured stretch rather than left to find
        // its level from nothing: from zero power it overshoots by orders of
        // magnitude, and the first sound out clips.
        for (let i = Math.round(0.05 * rate); i > 0; i--) sample();
        let sum = 0;
        const n = Math.round(0.1 * rate);
        for (let i = 0; i < n; i++) { sample(); sum += raw * raw; }
        power = sum / n;
        gain = LEVEL / Math.sqrt(power + 1e-24);
      }
      want.gate = !!p.gate;
    }
  };

  voice.process = out => {
    for (let at = 0; at < out.length; at += BLOCK) {
      cur.f0 = want.f0 + (cur.f0 - want.f0) * glide;
      for (let i = 0; i < 5; i++) cur.fs[i] = want.fs[i] + (cur.fs[i] - want.fs[i]) * glide;
      retune();
      const end = Math.min(out.length, at + BLOCK);
      for (let i = at; i < end; i++) out[i] = sample();
    }
  };

  return voice;
};

// A fixed vowel rendered whole, for the tests: opened, held, closed, then peak
// normalised to `level`.
export const synthVowel = ({ f0, f1, f2, tract, natural = false, seconds = 1.5, rate = 48000,
                             level = 0.5, random }) => {
  const n = Math.max(1, Math.round(seconds * rate));
  const out = new Float32Array(n);
  const v = createVoice(rate, random);
  v.set({ f0, f1, f2, tract, natural, gate: true });
  const hold = Math.max(0, n - Math.round(RELEASE_S * rate));
  v.process(out.subarray(0, hold));
  v.set({ gate: false });
  v.process(out.subarray(hold));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] = level * out[i] / (peak || 1);
  return out;
};
