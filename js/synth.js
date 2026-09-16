// A test vowel: a pitch and a place on the vowel plane, turned into sound.
//
// The classic cascade formant synthesiser, cut down to what a test tone needs.
// A pulse train at the pitch, shaped by a glottal low-pass, run through five
// resonators in series, then differentiated for radiation from the lips. The
// source falls 12 dB an octave and radiation lifts 6 back, which is the tilt a
// real voice has, so the analysis meets something like what it was built for.
//
// Nothing here touches a browser: it returns samples, and the page wraps them
// in a WAV and plays them through the same analysis a recording goes through.
// That is the point of it. Click a spot, and the dot should land on it.

// Where the formants the plane does not show sit. F3 is placed above F2 with
// room to spare, since a front vowel's F2 climbs towards it, and F4 and F5
// stay above both. Without them LPC fits its spare poles to the tilt and can
// hand one back as a formant that is not there.
export const upperFormants = f2 => {
  const f3 = Math.min(3800, Math.max(2500, f2 + 400));
  const f4 = Math.max(3500, f3 + 700);
  return [f3, f4, Math.max(4500, f4 + 800)];
};

// Bandwidths in Hz, widening with frequency the way measured vowels do.
const BANDWIDTHS = [70, 100, 130, 180, 250];

// The digital resonator, y = A x + B y1 + C y2, at unity gain at 0 Hz, so a
// cascade of them keeps the formants' relative levels right without tuning.
const resonator = (f, bw, rate) => {
  const T = 1 / rate;
  const C = -Math.exp(-2 * Math.PI * bw * T);
  const B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
  const A = 1 - B - C;
  let y1 = 0, y2 = 0;
  return x => { const y = A * x + B * y1 + C * y2; y2 = y1; y1 = y; return y; };
};

export const synthVowel = ({ f0, f1, f2, seconds = 1.5, rate = 48000, level = 0.5 }) => {
  const n = Math.max(1, Math.round(seconds * rate));
  const out = new Float32Array(n);
  const stages = [f1, f2, ...upperFormants(f2)]
    .map((f, i) => resonator(f, BANDWIDTHS[i], rate));
  const glottis = resonator(0, 100, rate);

  // The pulse lands between samples, split across the two either side of where
  // it falls. Rounded to a whole sample the period would wobble by one sample
  // in every few, and the pitch trace would show it.
  let phase = 0, carry = 0, prev = 0;
  const step = f0 / rate;
  for (let i = 0; i < n; i++) {
    let src = carry;
    carry = 0;
    phase += step;
    if (phase >= 1) {
      phase -= 1;
      const frac = phase / step;          // how far past this sample the pulse was due
      src += 1 - frac;
      carry = frac;
    }
    let y = glottis(src);
    for (const s of stages) y = s(y);
    out[i] = y - prev;                    // radiation at the lips
    prev = y;
  }

  // Short fades so the start and end do not click, then peak normalised. In
  // that order: the filters ring hardest in the first milliseconds, and
  // normalising to that transient would leave the vowel itself too quiet.
  const fade = Math.min(Math.round(0.02 * rate), n >> 2);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i] *= Math.min(1, i / (fade || 1), (n - 1 - i) / (fade || 1));
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] = level * out[i] / (peak || 1);
  return out;
};
