// The pure half: signal in, numbers out. Nothing here touches the DOM, the
// microphone or the clock, which is what makes test/dsp.test.js possible.

import {
  F0_FLOOR, F0_CEILING, AA_CUTOFF, AA_TAPS, CLARITY, OCTAVE_TOL,
  LPC_ORDER, LPC_WIN, PRE_EMPH, F_MIN, F_MAX, BW_MAX,
  F1_RANGE, F2_RANGE, MIN_GAP, CONT_W, F3_RANGE, F3_GAP,
  SOUND_SPEED, SEMITONE_REF, BRIGHT_LO, BRIGHT_HI,
  NUC_DF1, NUC_DF2, NUC_REF_MS, NUC_WINDOW_MS, NUC_MIN_MS, NUC_TOL,
  CONFIRM_BARK, SMOOTH_N, GLIDE, TRAIL_N, TRAIL_MIN
} from "./constants.js";

// --- decimation ----------------------------------------------------------
// A windowed sinc, evaluated only at the output positions, so decimating costs
// one filtered sample per output rather than a full-rate pass thrown away.
export const makeTaps = rate => {
  const fc = AA_CUTOFF / rate, m = (AA_TAPS - 1) / 2, t = new Float32Array(AA_TAPS);
  let sum = 0;
  for (let i = 0; i < AA_TAPS; i++) {
    const x = i - m;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    t[i] = sinc * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (AA_TAPS - 1)));
    sum += t[i];
  }
  for (let i = 0; i < AA_TAPS; i++) t[i] /= sum;
  return t;
};

export const decimate = (buf, dec, taps, out) => {
  const half = (taps.length - 1) >> 1;
  for (let i = 0; i < out.length; i++) {
    const c = i * dec;
    let acc = 0;
    for (let k = 0; k < taps.length; k++) {
      const j = c + k - half;
      if (j >= 0 && j < buf.length) acc += buf[j] * taps[k];
    }
    out[i] = acc;
  }
  return out;
};

// --- pitch ---------------------------------------------------------------
// Normalised square difference, the McLeod pitch method. The autocorrelation
// at each lag is divided by the energy of the two windows it compares, which
// is what stops a fading note from reading as a falling one.
export const detectPitch = (x, rate, rmsGate) => {
  let rms = 0;
  for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
  if (Math.sqrt(rms / x.length) < rmsGate) return null;

  const maxLag = Math.min(x.length - 2, Math.floor(rate / F0_FLOOR));
  const minLag = Math.max(2, Math.floor(rate / F0_CEILING));
  if (maxLag <= minLag) return null;

  // Filled from lag 1, not from minLag. The lobe around zero has to actually
  // exist for the scan below to step over it: starting at minLag put the top
  // of a high voice inside that lobe and swallowed it, and 440 Hz read as 220.
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag; lag++) {
    let ac = 0, e = 0;
    for (let i = 0; i + lag < x.length; i++) {
      const a = x[i], b = x[i + lag];
      ac += a * b; e += a * a + b * b;
    }
    nsdf[lag] = e > 0 ? 2 * ac / e : 0;
  }

  // Key maxima are the top of each positive run, past the lobe around zero.
  // The first one within OCTAVE_TOL of the best is taken rather than the best
  // itself, because the best is frequently an octave below what you produced.
  const peaks = [];
  let i = 1;
  while (i < maxLag && nsdf[i] > 0) i++;
  while (i < maxLag) {
    while (i < maxLag && nsdf[i] <= 0) i++;
    let top = i;
    while (i < maxLag && nsdf[i] > 0) { if (nsdf[i] > nsdf[top]) top = i; i++; }
    if (top >= minLag && top < maxLag) peaks.push(top);
  }
  if (!peaks.length) return null;

  let gmax = 0;
  for (const p of peaks) if (nsdf[p] > gmax) gmax = nsdf[p];
  if (gmax < CLARITY) return null;
  const best = peaks.find(p => nsdf[p] >= OCTAVE_TOL * gmax);
  if (best === undefined) return null;

  // Parabolic interpolation on the peak. Without it the reading quantises to
  // whole samples, which at this rate is several Hz at speaking pitch.
  const a = nsdf[best - 1], b = nsdf[best], c = nsdf[best + 1], d = a - 2 * b + c;
  const hz = rate / (d !== 0 ? best + 0.5 * (a - c) / d : best);
  return hz >= F0_FLOOR && hz <= F0_CEILING ? hz : null;
};

// Bark, Traunmuller. Hz is not how a vowel is heard, so both the distance to a
// target and the continuity test between frames are measured here, not in Hz.
export const bark = f => 26.81 * f / (1960 + f) - 0.53;

// --- formants ------------------------------------------------------------
// Levinson-Durbin on the autocorrelation, the standard route to LPC
// coefficients. Returns the polynomial 1 + a1 z^-1 + ... + ap z^-p.
export const lpc = (x, order) => {
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = 0; i + k < x.length; i++) s += x[i] * x[i + k];
    r[k] = s;
  }
  if (!(r[0] > 0)) return null;
  const a = new Float64Array(order + 1), prev = new Float64Array(order + 1);
  a[0] = 1;
  let e = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    prev.set(a);
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    e *= 1 - k * k;
    if (!(e > 0)) return null;
  }
  return a;
};

// Durand-Kerner finds every root of the LPC polynomial at once. A degree-12
// polynomial thirty times a second is nothing, and unlike peak-picking a
// spectrum it gives the bandwidth as well, which is what rejects a pole that
// is not a formant.
export const roots = (a, order) => {
  const zr = new Float64Array(order), zi = new Float64Array(order);
  // Seeded on a spiral off the real axis, the usual choice: real seeds make
  // the iteration stall on a polynomial with conjugate pairs, which is every
  // polynomial here.
  let cr = 1, ci = 0;
  for (let i = 0; i < order; i++) {
    zr[i] = cr; zi[i] = ci;
    const nr = cr * 0.4 - ci * 0.9, ni = cr * 0.9 + ci * 0.4;
    cr = nr; ci = ni;
  }
  for (let it = 0; it < 60; it++) {
    let moved = 0;
    for (let i = 0; i < order; i++) {
      // P(z) by Horner, coefficients descending: 1, a1, ... ap
      let pr = 1, pi = 0;
      for (let k = 1; k <= order; k++) {
        const nr = pr * zr[i] - pi * zi[i] + a[k];
        pi = pr * zi[i] + pi * zr[i];
        pr = nr;
      }
      let dr = 1, di = 0;
      for (let j = 0; j < order; j++) {
        if (j === i) continue;
        const ar = zr[i] - zr[j], ai = zi[i] - zi[j];
        const nr = dr * ar - di * ai;
        di = dr * ai + di * ar;
        dr = nr;
      }
      const den = dr * dr + di * di;
      if (den < 1e-30) continue;
      const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
      zr[i] -= qr; zi[i] -= qi;
      moved += Math.abs(qr) + Math.abs(qi);
    }
    if (moved < 1e-12) break;
  }
  return { zr, zi };
};

// A pole becomes a formant at angle x rate / 2pi, with bandwidth from how far
// inside the unit circle it sits. A frame with no plausible F1 returns nothing
// at all, which is the point: before the ranges existed, a missing F1 meant F2
// was reported in its place and the dot leapt across the plane.
export const formants = (x, rate, prev) => {
  const n = Math.min(LPC_WIN, x.length);
  const w = new Float64Array(n);
  const off = x.length - n;
  for (let i = 0; i < n; i++) {
    const s = x[off + i] - (i > 0 ? PRE_EMPH * x[off + i - 1] : 0);
    w[i] = s * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1)));
  }
  const a = lpc(w, LPC_ORDER);
  if (!a) return null;
  const { zr, zi } = roots(a, LPC_ORDER);
  const c = [];
  for (let i = 0; i < LPC_ORDER; i++) {
    if (zi[i] <= 0) continue;
    const mag = Math.hypot(zr[i], zi[i]);
    if (!(mag > 0) || mag >= 1) continue;
    const f = Math.atan2(zi[i], zr[i]) * rate / (2 * Math.PI);
    const bw = -Math.log(mag) * rate / Math.PI;
    if (f >= F_MIN && f <= F_MAX && bw <= BW_MAX) c.push({ f, bw });
  }
  c.sort((p, q) => p.f - q.f);

  // F2 is the next resonance above F1, not the narrowest pole above it. That
  // distinction is the whole selection: scoring every pair let a narrow pole
  // at 2600 beat the real F2 at 1558 on bandwidth alone, and continuity then
  // held the wrong track for the rest of the take.
  let best = null, bestScore = Infinity;
  for (let i = 0; i < c.length; i++) {
    const A = c[i];
    if (A.f < F1_RANGE[0] || A.f > F1_RANGE[1]) continue;
    let B = null;
    for (let j = i + 1; j < c.length; j++) {
      if (c[j].f - A.f < MIN_GAP) continue;
      if (c[j].f < F2_RANGE[0]) continue;
      if (c[j].f > F2_RANGE[1]) break;
      B = c[j];
      break;
    }
    if (!B) continue;
    // Bandwidth is a tiebreak between candidate F1s, never a reason to skip
    // a resonance.
    let sc = (A.bw + B.bw) / 4000;
    if (prev) sc += CONT_W * Math.hypot(bark(A.f) - bark(prev[0]), bark(B.f) - bark(prev[1]));
    else sc += 0.3 * bark(A.f);   // with no history, the lowest plausible F1
    if (sc < bestScore) { bestScore = sc; best = [A.f, B.f]; }
  }
  if (!best) return null;

  // F3 is picked after the fact, by the same next-resonance rule, and never
  // influences which poles became F1 and F2.
  let f3 = null;
  for (const q of c) {
    if (q.f - best[1] < F3_GAP) continue;
    if (q.f < F3_RANGE[0]) continue;
    if (q.f > F3_RANGE[1]) break;
    f3 = q.f;
    break;
  }
  return [best[0], best[1], f3];
};

// --- derived figures -----------------------------------------------------
// A uniform tube of length L resonates every c/2L, so L = c / (F3 - F1).
export const vtl = (f1, f3) =>
  f1 != null && f3 != null && f3 > f1 ? SOUND_SPEED / (f3 - f1) : null;

export const semitones = hz => 12 * Math.log2(hz / SEMITONE_REF);

// Centre of mass of the spectrum over BRIGHT_LO to BRIGHT_HI, from an
// analyser's dB bins. Power, not magnitude: Praat's centre of gravity is power
// weighted by default and the offline measure is computed that way, so
// weighting by magnitude here would give the same name to a different number.
export const centroid = (freqDb, sampleRate) => {
  if (!freqDb || !freqDb.length) return null;
  const nyq = sampleRate / 2, n = freqDb.length;
  const i0 = Math.max(1, Math.floor(BRIGHT_LO / nyq * n));
  const i1 = Math.min(n - 1, Math.ceil(BRIGHT_HI / nyq * n));
  let num = 0, den = 0;
  for (let i = i0; i <= i1; i++) {
    const w = Math.pow(10, freqDb[i] / 10);
    num += w * (i * nyq / n);
    den += w;
  }
  return den > 0 ? num / den : null;
};

export const median = arr => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const sd = arr => {
  if (arr.length < 2) return null;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
};

// The boundary the reference markers delimit: the convex hull of one set's
// vowel averages, computed from the points rather than drawn through corner
// vowels picked by hand.
export const hull = pts => {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = seq => {
    const out = [];
    for (const q of seq) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return half(p).concat(half(p.slice().reverse()));
};

// --- the vowel tracker ---------------------------------------------------
// What decides that a frame is a vowel rather than a consonant or a
// transition, and what the dot is allowed to do about it. Stateful, but the
// state is all here and it is created rather than global, so a test can run a
// whole utterance through one and read the result.
export const createVowelTracker = () => {
  const hist = [];     // recent [t, f1, f2, f3], for smoothing and steadiness
  const run = [];      // consecutive nuclei, for the corroboration test
  const trail = [];    // the drawn path, with null where voicing broke
  const st = { now: null, target: null, smooth: null, steady: false, trail };

  // Median over the last few frames, not a mean: one badly tracked frame
  // should not drag the dot, and a median cannot be dragged by one.
  const mid = arr => { const s = arr.slice().sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };

  st.push = (f, t) => {
    if (!f) {
      hist.length = 0; run.length = 0; st.now = null; st.steady = false;
      // A break in the path rather than a cleared path: where you stopped
      // voicing is information, and joining across it would draw a move that
      // never happened.
      if (trail.length && trail[trail.length - 1] !== null) trail.push(null);
      while (trail.length > TRAIL_N) trail.shift();
      return;
    }
    hist.push([t, f[0], f[1], f[2]]);
    while (hist.length > 24) hist.shift();

    const last = hist.slice(-SMOOTH_N);
    const f3s = last.map(r => r[3]).filter(v => v != null);
    st.now = [mid(last.map(r => r[1])), mid(last.map(r => r[2])), f3s.length ? mid(f3s) : null];

    const back = hist.filter(r => t - r[0] <= NUC_WINDOW_MS);
    const span = back.length >= 2 ? back[back.length - 1][0] - back[0][0] : 0;
    const scale = span / NUC_REF_MS;
    st.steady = span >= NUC_MIN_MS &&
      Math.abs(back[0][1] - back[back.length - 1][1]) < NUC_DF1 * scale * NUC_TOL &&
      Math.abs(back[0][2] - back[back.length - 1][2]) < NUC_DF2 * scale * NUC_TOL;

    // Only a nucleus moves the dot. Everything between one vowel and the next
    // is a transition, and a transition is not a vowel you were aiming at.
    //
    // This is measured, not a preference. Sliding the analysis across
    // synthesised speech on 2026-09-08, the estimate moved 0.498 Bark per frame
    // where the formants themselves moved 0.504: the tracker is not noisy,
    // speech is fast. Smoothing harder would only have added lag while hiding
    // real movement, so what changed is what gets drawn.
    if (!st.steady) run.length = 0;
    else {
      run.push(st.now.slice());
      if (run.length > 3) run.shift();
    }

    // Two nuclei in a row, agreeing, before anything moves.
    const confirmed = run.length >= 2 &&
      Math.hypot(bark(run[run.length - 2][0]) - bark(run[run.length - 1][0]),
                 bark(run[run.length - 2][1]) - bark(run[run.length - 1][1])) < CONFIRM_BARK;

    if (confirmed) {
      st.target = st.now.slice();
      let prev = null;
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i]) { prev = trail[i]; break; }
      if (!prev || Math.hypot(bark(st.target[0]) - bark(prev[0]),
                              bark(st.target[1]) - bark(prev[1])) > TRAIL_MIN) {
        trail.push(st.target.slice());
        while (trail.length > TRAIL_N) trail.shift();
      }
    }
  };

  // The dot eases toward the vowel last held, every frame, whether or not this
  // one was voiced. That turns a move between two vowels into a glide rather
  // than a jump, without the dot ever visiting the noise in between.
  st.glide = () => {
    if (!st.target) return;
    st.smooth = st.smooth
      ? [st.smooth[0] + (st.target[0] - st.smooth[0]) * GLIDE,
         st.smooth[1] + (st.target[1] - st.smooth[1]) * GLIDE]
      : st.target.slice();
  };

  st.reset = () => {
    hist.length = 0; run.length = 0; trail.length = 0;
    st.now = null; st.target = null; st.smooth = null; st.steady = false;
  };

  return st;
};
