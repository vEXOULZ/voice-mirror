// The two canvases. Hand-drawn 2D rather than a charting library: one of these
// is redrawn thirty times a second, which is the worst case there is for a
// chart instance that watches the document for changes.

import {
  F0_FLOOR, F0_CEILING, GRID, PLANE_F1, PLANE_F2, REF_TONE,
  TRACK_MAX, TRACK_GRID, TRACK_TONE
} from "./constants.js";
import { hull } from "./dsp.js";
import { t, td } from "./i18n.js";

const VOICE = "rgb(80,160,110)";   // this voice, on the plane

const tokens = () => {
  const css = getComputedStyle(document.body);
  const get = (n, d) => (css.getPropertyValue(n).trim() || d);
  return {
    ink: get("--ink", "#ccc"),
    rule: get("--border", "#444"),
    accent: get("--accent", "#7aa2f7")
  };
};

// A canvas sized in CSS pixels draws blurry on a retina screen, so the bitmap
// follows the device and the context is scaled back to CSS units.
const fit = (cv, g) => {
  const r = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.round(cv.clientWidth * r), h = Math.round(cv.clientHeight * r);
  if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  g.setTransform(r, 0, 0, r, 0, 0);
  return [cv.clientWidth, cv.clientHeight];
};

const AXIS = 30;

// The order pitch labels claim their place in: the roundest numbers first, so
// when two collide the one a reader would look for is the one that stays.
const GRID_PRIORITY = [100, 200, 300, 500, 150, 400, 80, 250, 125, 175];

const yOf = (hz, h) => {
  const a = Math.log(F0_FLOOR), b = Math.log(F0_CEILING);
  return h - (Math.log(hz) - a) / (b - a) * h;
};

export const drawTrace = (cv, { trace, cursor, bands }) => {
  const g = cv.getContext("2d");
  const [w, h] = fit(cv, g);
  if (!w || !h) return;
  g.clearRect(0, 0, w, h);
  const T = tokens();

  const shaded = bands.filter(b => b.shade !== false);
  for (const b of shaded) {
    g.fillStyle = b.color;
    const y1 = yOf(Math.min(b.high, F0_CEILING), h);
    const y2 = yOf(Math.max(b.low, F0_FLOOR), h);
    g.fillRect(AXIS, y1, w - AXIS, y2 - y1);
  }

  g.font = "10px system-ui, sans-serif";
  g.textBaseline = "middle";
  // Every gridline is drawn, but a label only where it has room. On a log
  // axis 150, 175, 200 and 250 fall a dozen pixels apart, exactly where a
  // speaking voice lives, so labels are placed in order of how round they are
  // and one that would crowd a label already placed is left off.
  const LABEL_GAP = 13;
  const placed = [];
  for (const t of GRID_PRIORITY) {
    const y = Math.min(h - 6, Math.max(6, yOf(t, h)));
    if (placed.every(p => Math.abs(p.y - y) >= LABEL_GAP)) placed.push({ t, y });
  }
  for (const t of GRID) {
    const y = Math.round(yOf(t, h)) + 0.5;
    g.globalAlpha = 0.3; g.strokeStyle = T.rule; g.lineWidth = 1;
    g.beginPath(); g.moveTo(AXIS, y); g.lineTo(w, y); g.stroke();
  }
  g.globalAlpha = 0.65; g.fillStyle = T.ink;
  // Kept off the edges: the top gridline sits at y=0, and a label centred on
  // it loses its upper half to the canvas boundary.
  for (const p of placed) g.fillText(String(p.t), 2, p.y);
  g.globalAlpha = 1;

  // Each band names itself, the way the per-recording charts do. Top left,
  // because new sound enters at the right and a label there would sit under
  // the newest point of the line. A band too thin to hold its label gets it
  // just above instead. Bands may overlap, so a label that would land on one
  // already written moves right, past it, rather than printing over it.
  g.font = "11px system-ui, sans-serif";
  g.textAlign = "left";
  g.textBaseline = "top";
  const labels = [];
  for (const b of shaded) {
    const y1 = yOf(Math.min(b.high, F0_CEILING), h);
    const y2 = yOf(Math.max(b.low, F0_FLOOR), h);
    const text = (b.name ? td(b.name) + "  " : "") + b.low + "-" + b.high + " Hz";
    const tw = g.measureText(text).width;
    const y = y2 - y1 >= 16 ? y1 + 3 : Math.max(0, y1 - 14);
    let x = AXIS + 6;
    for (const l of labels) {
      if (Math.abs(l.y - y) < 13 && x < l.x + l.w + 12 && x + tw > l.x) x = l.x + l.w + 12;
    }
    labels.push({ x, y, w: tw });
    g.globalAlpha = 0.8; g.fillStyle = T.ink;
    g.fillText(text, x, y);
  }
  g.globalAlpha = 1;
  g.textBaseline = "middle";

  // Each voiced run is its own stroke, so an unvoiced gap reads as a gap
  // instead of a line joining two sounds that were never continuous.
  const n = trace.length;
  g.strokeStyle = T.accent;
  g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath();
  let open = false;
  for (let i = 0; i < n; i++) {
    const v = trace[(cursor + i) % n];
    if (v == null) { open = false; continue; }
    const x = AXIS + (w - AXIS) * i / (n - 1), y = yOf(v, h);
    if (open) g.lineTo(x, y); else { g.moveTo(x, y); open = true; }
  }
  g.stroke();
};

// The first three formants over the same ten seconds the pitch trace covers,
// on the same axis and in the same colours as the offline tool's per-recording
// chart. Gaps are unvoiced: silence, or a consonant with no voicing in it.
//
// These are the per-frame estimates, not the median the dot is drawn from. The
// dot answers "which vowel is this", and smoothing helps it; the track answers
// "what are the formants doing", and smoothing would hide the answer.
export const drawFormants = (cv, { frames, cursor }) => {
  const g = cv.getContext("2d");
  const [w, h] = fit(cv, g);
  if (!w || !h) return;
  g.clearRect(0, 0, w, h);
  const T = tokens();
  const n = frames.length;
  const Y = hz => h - (Math.min(hz, TRACK_MAX) / TRACK_MAX) * h;

  g.font = "10px system-ui, sans-serif";
  g.textBaseline = "middle";
  for (const hz of TRACK_GRID) {
    const y = Math.round(Y(hz)) + 0.5;
    g.globalAlpha = 0.3; g.strokeStyle = T.rule; g.lineWidth = 1;
    g.beginPath(); g.moveTo(AXIS, y); g.lineTo(w, y); g.stroke();
    g.globalAlpha = 0.65; g.fillStyle = T.ink;
    g.fillText(String(hz), 2, Math.min(h - 6, Math.max(6, y)));
  }
  g.globalAlpha = 1;

  TRACK_TONE.forEach(([, colour], k) => {
    g.strokeStyle = colour;
    g.lineWidth = 1.5; g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    let open = false;
    for (let i = 0; i < n; i++) {
      const f = frames[(cursor + i) % n];
      const v = f && f[k];
      if (v == null) { open = false; continue; }
      const x = AXIS + (w - AXIS) * i / (n - 1), y = Y(v);
      if (open) g.lineTo(x, y); else { g.moveTo(x, y); open = true; }
    }
    g.stroke();
  });
};

// Room on the left and bottom for axis titles as well as tick numbers.
const PL = 50, PB = 36, PT = 6, PR = 8;

// Both axes run high to low, the phonetic convention, because it makes the
// plane a picture of the mouth: up is a higher tongue, left is a fronter one.
const planeScale = (w, h) => ({
  X: f2 => PL + (1 - (f2 - PLANE_F2[0]) / (PLANE_F2[1] - PLANE_F2[0])) * (w - PL - PR),
  Y: f1 => PT + (f1 - PLANE_F1[0]) / (PLANE_F1[1] - PLANE_F1[0]) * (h - PT - PB)
});

// The reverse, for a click: CSS pixels inside the canvas to [F1, F2], or null
// outside the plotted square. Worked from the same numbers the drawing uses,
// so the sound made is the one under the pointer.
// With `clamp`, a point outside is pulled to the nearest edge instead, for a
// drag that runs off the plot.
export const planeAt = (cv, x, y, clamp = false) => {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (clamp) {
    x = Math.min(w - PR, Math.max(PL, x));
    y = Math.min(h - PB, Math.max(PT, y));
  }
  if (x < PL || x > w - PR || y < PT || y > h - PB) return null;
  const f2 = PLANE_F2[0] + (1 - (x - PL) / (w - PL - PR)) * (PLANE_F2[1] - PLANE_F2[0]);
  const f1 = PLANE_F1[0] + (y - PT) / (h - PT - PB) * (PLANE_F1[1] - PLANE_F1[0]);
  return [f1, f2];
};

export const drawPlane = (cv, { rows, target, trail, smooth, steady, probe, heard }) => {
  const g = cv.getContext("2d");
  const [w, h] = fit(cv, g);
  if (!w || !h) return;
  g.clearRect(0, 0, w, h);
  const T = tokens();
  const L = PL, B = PB, TOP = PT, R = PR;
  const { X, Y } = planeScale(w, h);

  g.font = "10px system-ui, sans-serif";
  g.textBaseline = "middle";
  g.strokeStyle = T.rule; g.lineWidth = 1; g.globalAlpha = 0.3;
  g.strokeRect(L, TOP, w - L - R, h - TOP - B);
  g.globalAlpha = 0.55; g.fillStyle = T.ink;
  g.textAlign = "right";
  for (const f1 of [200, 400, 600, 800, 1000]) g.fillText(String(f1), L - 4, Y(f1));
  g.textAlign = "center";
  for (const f2 of [3000, 2000, 1000]) g.fillText(String(f2), X(f2), h - B + 10);

  // Axis titles. Without them the plane is two bare scales of numbers, and
  // what up and left mean was only written in the footer, far from the chart.
  g.globalAlpha = 0.8;
  g.font = "11px system-ui, sans-serif";
  g.fillText(t("plane.f2"), L + (w - L - R) / 2, h - 8);
  g.save();
  g.translate(10, TOP + (h - TOP - B) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText(t("plane.f1"), 0, 0);
  g.restore();
  g.textAlign = "left";
  g.font = "10px system-ui, sans-serif";
  g.globalAlpha = 1;

  // The boundary the markers delimit, computed from the points rather than
  // drawn through corner vowels picked by hand. Outline only, never filled.
  for (const k of ["m", "w"]) {
    const edge = hull(rows.map(v => ({ x: v[k + "_f2"], y: v[k + "_f1"] })));
    if (edge.length < 3) continue;
    g.strokeStyle = REF_TONE[k]; g.lineWidth = 1.2;
    g.globalAlpha = 0.45; g.setLineDash([5, 4]);
    g.beginPath();
    edge.forEach((q, i) => { const x = X(q.x), y = Y(q.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath(); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }

  // A target is a vowel, and both reference points for it light up. Which of
  // the two is a goal is yours and your clinician's, so the tool declines to
  // make that half of the choice and shows the distance to each.
  for (const v of rows) {
    for (const k of ["m", "w"]) {
      const isT = target && target.vowel === v.vowel;
      const x = X(v[k + "_f2"]), y = Y(v[k + "_f1"]);
      g.globalAlpha = target ? (isT ? 1 : 0.22) : 0.75;
      g.fillStyle = REF_TONE[k];
      g.beginPath();
      g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 1; g.stroke();
      if (isT) {
        g.strokeStyle = REF_TONE[k]; g.lineWidth = 1.5;
        g.setLineDash([4, 3]);
        g.beginPath(); g.arc(x, y, 22, 0, 2 * Math.PI); g.stroke();
        g.setLineDash([]);
      }
      // Larger and firmer than before: at 10px and half opacity the vowel
      // letters were barely legible on a phone.
      if (!target || isT) {
        g.font = "600 12px system-ui, sans-serif";
        g.fillStyle = T.ink; g.globalAlpha = isT ? 1 : 0.75;
        g.fillText(v.vowel, x + 8, y - 8);
        g.font = "10px system-ui, sans-serif";
      }
      g.globalAlpha = 1;
    }
  }

  // Where the last test vowel was asked for: a crosshair, in the accent colour
  // rather than the voice's green, so the dot the analysis draws can be seen
  // landing on it or missing.
  if (probe) {
    const x = X(probe[1]), y = Y(probe[0]);
    g.strokeStyle = T.accent; g.lineWidth = 1.5; g.globalAlpha = 0.9;
    g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI); g.stroke();
    g.beginPath();
    g.moveTo(x - 14, y); g.lineTo(x - 4, y); g.moveTo(x + 4, y); g.lineTo(x + 14, y);
    g.moveTo(x, y - 14); g.lineTo(x, y - 4); g.moveTo(x, y + 4); g.lineTo(x, y + 14);
    g.stroke();
    // And where the analysis heard it, after a still test: a hollow ring in
    // the voice's colour, tied to the crosshair, so a miss has a size.
    if (heard) {
      const hx = X(heard[1]), hy = Y(heard[0]);
      g.strokeStyle = VOICE; g.lineWidth = 1.5;
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x, y); g.lineTo(hx, hy); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(hx, hy, 6, 0, 2 * Math.PI); g.stroke();
    }
    g.globalAlpha = 1;
  }

  // The path, not a scatter: the eye follows a line where it cannot follow a
  // swarm of dots, and where the vowel has just been is the context that makes
  // where it is now readable.
  g.strokeStyle = VOICE;
  g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    if (!a || !b) continue;
    g.globalAlpha = 0.08 + 0.5 * (i / Math.max(1, trail.length - 1));
    g.beginPath();
    g.moveTo(X(a[1]), Y(a[0]));
    g.lineTo(X(b[1]), Y(b[0]));
    g.stroke();
  }
  g.globalAlpha = 1;

  if (smooth) {
    // Solid once it has held still long enough to be a vowel, faint while it
    // is still moving, which is what a consonant or a transition looks like.
    g.fillStyle = VOICE;
    g.globalAlpha = steady ? 1 : 0.3;
    g.beginPath(); g.arc(X(smooth[1]), Y(smooth[0]), steady ? 7 : 5, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1.5; g.stroke();
    g.globalAlpha = 1;
  }
};
