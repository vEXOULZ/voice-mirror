// Wiring and the frame loop.

import {
  FPS, WINDOW_S, READ_EVERY, RMS_GATE, CAL_SECONDS, CAL_OVER, CAL_MIN, CAL_MAX
} from "./constants.js";
import {
  decimate, detectPitch, formants, centroid, vtl, median, createVowelTracker
} from "./dsp.js";
import { loadShipped, parseReference, zoneEdges, langsOf } from "./reference.js";
import { drawTrace, drawFormants, drawPlane } from "./draw.js";
import { createEngine } from "./audio.js";
import { createUI } from "./ui.js";
import * as store from "./settings.js";

const ui = createUI();
const el = ui.el;
const engine = createEngine();
const tracker = createVowelTracker();

const EMPTY_REF = { name: "", bands: [], vowels: [], languages: {}, sentences: [], sources: {}, dropped: [] };
let shipped = EMPTY_REF;
let ref = EMPTY_REF;
let settings = store.load();
let edges = [];
let rmsGate = RMS_GATE;

// Your bands win over the reference file's. Kept apart rather than copied in,
// so "back to the shipped bands" is a matter of forgetting yours.
const bands = () => settings.bands || ref.bands;

// --- the session ---------------------------------------------------------
// Everything on screen describes one pass. Starting the microphone, playing a
// take back, or pressing Reset begins a new one.
const N = WINDOW_S * FPS;
const s = {
  trace: new Array(N).fill(null), cursor: 0,
  track: new Array(N).fill(null),
  voiced: [], brights: [], vtls: [],
  f1s: [], f2s: [], f3s: [], formantMed: [null, null, null],
  // Timestamped, and trimmed by the clock rather than by a count of frames. A
  // count would mean "the last ten seconds of voiced sound", which after a
  // pause is not the last ten seconds.
  f0Recent: [], counts: [0, 0, 0, 0, 0]
};
let frame = 0, last = 0, raf = 0, lastFormant = null, lastHz = null;

const resetSession = () => {
  ui.blank();
  s.trace.fill(null); s.track.fill(null); s.cursor = 0;
  s.voiced.length = 0; s.brights.length = 0; s.vtls.length = 0; s.f0Recent.length = 0;
  s.f1s.length = 0; s.f2s.length = 0; s.f3s.length = 0; s.formantMed = [null, null, null];
  s.counts.fill(0);
  lastFormant = null; lastHz = null;
  tracker.reset();
};

// Which zone a pitch falls in, against whatever the bands are now.
const zoneOf = hz => {
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i][0], b = edges[i][1];
    if ((a == null || hz >= a) && (b == null || hz < b)) return i;
  }
  return -1;
};

// Changing a band mid-session would leave the share bar counting half the
// pass against the old edges and half against the new. Every voiced frame is
// still held, so it is recounted exactly instead.
const recount = () => {
  edges = zoneEdges(bands().slice().sort((a, b) => a.low - b.low));
  s.counts.fill(0);
  for (const hz of s.voiced) {
    const z = zoneOf(hz);
    if (z >= 0) s.counts[z]++;
  }
  if (s.voiced.length) ui.readouts(lastHz, s, lastFormant);
};

// --- drawing -------------------------------------------------------------
const rowsForLang = () => ref.vowels.filter(v => v.lang === el.refLang.value);

const paint = () => {
  if (ui.panelShown("pitch")) {
    drawTrace(el.trace, { trace: s.trace, cursor: s.cursor, bands: bands() });
  }
  if (ui.panelShown("formants")) {
    drawFormants(el.formants, { frames: s.track, cursor: s.cursor });
  }
  if (ui.panelShown("plane")) {
    drawPlane(el.plane, {
      rows: rowsForLang(), target: ui.targetOf(ref),
      trail: tracker.trail, smooth: tracker.smooth, steady: tracker.steady
    });
  }
};

const repaint = () => { paint(); ui.advise(ui.targetOf(ref), tracker); };

// Text updates every eighth frame, so when a pass stops the last update can be
// up to seven frames behind the chart: the hint said "sustain a vowel" with
// the dot sitting on the plane. Stopping anything brings the text level with
// what is drawn.
const settle = () => {
  if (s.voiced.length) {
    s.formantMed = [median(s.f1s), median(s.f2s), median(s.f3s)];
    ui.readouts(lastHz, s, lastFormant);
  }
  repaint();
};
window.addEventListener("resize", paint);

// --- settings ------------------------------------------------------------
const persist = () => {
  if (!store.save(settings)) {
    ui.status("This browser would not save settings, so they last until the tab closes.", true);
  }
};

ui.onPanel = (key, on) => {
  settings.panels[key] = on;
  persist();
  ui.applyPanels(settings.panels);
  repaint();
};

el.theme.onchange = e => {
  settings.theme = e.target.value;
  ui.applyTheme(settings.theme);
  persist();
  // The canvases read their ink from the theme, so they redraw with it.
  repaint();
};

// Edited in place, so the row being typed in keeps its focus. The list is
// only re-rendered when a row is added or removed.
ui.onBand = (i, band) => {
  const next = bands().map(b => ({ ...b }));
  next[i] = band;
  settings.bands = next;
  persist();
  el.bandReset.disabled = false;
  ui.showSources(ref, true);
  recount();
  paint();
};

ui.onBandRemove = i => {
  const next = bands().filter((_, k) => k !== i);
  settings.bands = next;
  persist();
  ui.renderBands(bands(), true);
  ui.showSources(ref, true);
  recount();
  paint();
};

el.bandAdd.onclick = () => {
  const cur = bands();
  const top = cur.length ? Math.max(...cur.map(b => b.high)) : 100;
  settings.bands = cur.map(b => ({ ...b })).concat([{
    name: "", low: Math.min(560, top + 10), high: Math.min(600, top + 60),
    color: store.hexToBand("#969696")
  }]);
  persist();
  ui.renderBands(bands(), true);
  ui.showSources(ref, true);
  recount();
  paint();
};

el.bandReset.onclick = () => {
  settings.bands = null;
  persist();
  ui.renderBands(bands(), false);
  ui.showSources(ref, false);
  recount();
  paint();
  ui.status("Pitch bands back to the shipped ones.");
};

// --- reference -----------------------------------------------------------
// A file that brings only bands keeps the shipped vowels, and one that brings
// only vowels keeps the shipped bands. Your clinician's bands should not cost
// you the diamonds.
const withShipped = r => ({
  ...r,
  bands: r.bands.length ? r.bands : shipped.bands,
  vowels: r.vowels.length ? r.vowels : shipped.vowels,
  languages: r.vowels.length ? r.languages : shipped.languages,
  sources: { ...shipped.sources, ...r.sources }
});

const useReference = (next, custom) => {
  ref = next;
  ui.fillReference(ref, langsOf(ref), el.refLang.value || "pt", custom, !!settings.bands);
  ui.applyPanels(settings.panels);
  ui.renderBands(bands(), !!settings.bands);
  recount();
  repaint();
};

// Nothing silently falls back: if what was loaded cannot be drawn, the page
// says so and keeps what it had.
const useReferenceFile = async f => {
  try {
    const text = await f.text();
    const next = withShipped(parseReference(text));
    settings.reference = JSON.parse(text);
    persist();
    useReference(next, true);
    ui.status("Reference loaded from " + f.name +
      (next.dropped.length ? ". Dropped " + next.dropped.length + " unusable row(s): "
        + next.dropped.join(", ") : "") + ". Saved in this browser, not uploaded.");
  } catch (e) {
    ui.status("Could not use " + f.name + ": " + e.message + " Keeping what was loaded.", true);
  }
};

el.pickRefBtn.onclick = () => el.pickRef.click();
el.pickRef.onchange = async () => {
  const f = el.pickRef.files && el.pickRef.files[0];
  if (f) await useReferenceFile(f);
  el.pickRef.value = "";
};

el.refReset.onclick = () => {
  settings.reference = null;
  persist();
  useReference(shipped, false);
  ui.status("Back to the shipped reference.");
};

el.refLang.onchange = () => { ui.fillTargets(ref); ui.showSources(ref, !!settings.bands); repaint(); };
el.target.onchange = repaint;
el.sayNext.onclick = () => { ui.sayAt++; ui.showSentence(); };

// --- moving settings between machines -----------------------------------
const saveFile = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

// Applies a whole settings object at once: import and reset both end here,
// so the page never shows half of one set and half of another.
const applyAll = () => {
  ui.applyTheme(settings.theme);
  let next = shipped, custom = false;
  if (settings.reference) {
    try { next = withShipped(parseReference(settings.reference)); custom = true; }
    catch (e) {
      ui.status("The saved reference could not be used: " + e.message + " Using the shipped one.", true);
      settings.reference = null;
    }
  }
  useReference(next, custom);
};

el.setExport.onclick = () => {
  saveFile(store.toFile(settings), "voice-mirror-settings.json");
  ui.status("Settings exported. Nothing about your voice is in that file.");
};

el.setImport.onclick = () => el.setImportFile.click();
el.setImportFile.onchange = async () => {
  const f = el.setImportFile.files && el.setImportFile.files[0];
  el.setImportFile.value = "";
  if (!f) return;
  try {
    settings = store.fromFile(await f.text());
    persist();
    applyAll();
    ui.status("Settings imported from " + f.name + ".");
  } catch (e) {
    ui.status("Could not import " + f.name + ": " + e.message, true);
  }
};

el.setReset.onclick = () => {
  if (!window.confirm("Forget your theme, panels, pitch bands and reference, in this browser?")) return;
  store.clear();
  settings = store.defaults();
  applyAll();
  ui.status("Settings reset. Export first next time if you want them back.");
};

// --- calibration ---------------------------------------------------------
// One pass of the same loop with the readouts suppressed: the level it
// measures is the level the gate is compared against, which a separate
// measurement could not guarantee.
let calUntil = 0;
const calRms = [];

const finishCalibration = () => {
  calUntil = 0;
  el.cal.disabled = !engine.listening();
  if (calRms.length < 10) { ui.status("Calibration heard nothing. Gate unchanged."); return; }
  const sorted = calRms.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const want = p95 * CAL_OVER;
  rmsGate = Math.min(CAL_MAX, Math.max(CAL_MIN, want));
  ui.status("Room measured at " + p95.toFixed(5) + ". Gate set to " + rmsGate.toFixed(5) +
    (want !== rmsGate ? " (clamped)" : "") + ". Default is " + RMS_GATE + ".");
};

// --- the loop ------------------------------------------------------------
const tick = ts => {
  raf = requestAnimationFrame(tick);
  if (ts - last < 1000 / FPS) return;
  last = ts;

  const x = decimate(engine.timeDomain(), engine.dec, engine.taps, engine.work);

  if (calUntil) {
    let r = 0;
    for (let i = 0; i < x.length; i++) r += x[i] * x[i];
    calRms.push(Math.sqrt(r / x.length));
    if (ts >= calUntil) finishCalibration();
    else { paint(); return; }
  }

  const rate = engine.workRate();
  const hz = detectPitch(x, rate, rmsGate);
  if (hz != null) {
    const c = centroid(engine.frequency(), engine.ctx.sampleRate);
    if (c != null) s.brights.push(c);
  }
  // Vocal tract length rides on the formants, so it is only taken where they
  // were steady enough to be a vowel at all. Read before the push below, so it
  // uses the same median the dot was drawn from.
  if (tracker.steady && tracker.now) {
    const L = vtl(tracker.now[0], tracker.now[2]);
    if (L != null) s.vtls.push(L);
  }
  // Formants are only asked for on a voiced frame. LPC over silence returns
  // the poles of the room, and they would wander the plane as if they were a
  // vowel you were producing.
  const f = hz == null ? null : formants(x, rate, tracker.now);
  tracker.push(f, ts);
  tracker.glide();

  s.trace[s.cursor] = hz;
  s.track[s.cursor] = f;
  lastHz = hz;
  s.cursor = (s.cursor + 1) % N;
  lastFormant = f;
  if (f) {
    s.f1s.push(f[0]); s.f2s.push(f[1]);
    if (f[2] != null) s.f3s.push(f[2]);
  }
  if (hz != null) {
    s.voiced.push(hz);
    s.f0Recent.push([ts, hz]);
    while (s.f0Recent.length && ts - s.f0Recent[0][0] > WINDOW_S * 1000) s.f0Recent.shift();
    const z = zoneOf(hz);
    if (z >= 0) s.counts[z]++;
  }

  paint();
  if (++frame % READ_EVERY === 0) {
    s.formantMed = [median(s.f1s), median(s.f2s), median(s.f3s)];
    ui.readouts(hz, s, f);
    ui.advise(ui.targetOf(ref), tracker);
    const secs = engine.recordingFor();
    if (secs != null) {
      ui.status("Recording " + Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0"));
    }
  }
};

const runLoop = () => { if (!raf) raf = requestAnimationFrame(tick); };
const stopLoop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

// --- buttons -------------------------------------------------------------
el.start.onclick = async () => {
  if (engine.listening()) {
    // Only the microphone stops. A take already recorded stays downloadable,
    // and the loop keeps running if something is being played.
    engine.stopMic();
    el.start.textContent = "Start";
    el.start.classList.remove("live");
    el.rec.textContent = "Record";
    el.rec.classList.remove("live");
    el.rec.disabled = true;
    el.cal.disabled = true;
    calUntil = 0;
    if (!engine.playing()) stopLoop();
    // Keep last 30s stays live after Stop. The ring still holds what was just
    // said, and realising it was worth keeping a second too late is the whole
    // case for the button.
    settle();
    ui.status(engine.clip ? "Microphone stopped. " + engine.clip.name + " is still loaded."
                          : "Microphone stopped.");
    return;
  }
  try {
    await engine.startMic();
  } catch (e) {
    ui.status("Microphone refused: " + (e && e.name ? e.name : String(e)), true);
    return;
  }
  resetSession();
  el.start.textContent = "Stop";
  el.start.classList.add("live");
  el.keep.disabled = !engine.hasTap();
  el.rec.disabled = !engine.canRecord();
  el.cal.disabled = false;
  // A tooltip does not exist on a touch screen, so a missing capability is
  // said where it will be read.
  const missing = [];
  if (!engine.canRecord()) missing.push("this browser cannot record, so Record is off");
  if (!engine.hasTap()) missing.push("this browser gives no rewind buffer, so Keep last 30s is off");
  ui.status("Listening at " + Math.round(engine.workRate()) + " Hz" +
    (missing.length ? ". Note: " + missing.join("; ") + "." : ""));
  runLoop();
};

el.rec.onclick = async () => {
  if (engine.rec) {
    const take = await engine.stopRecording();
    el.rec.textContent = "Record";
    el.rec.classList.remove("live");
    ui.showTake(take);
    ui.status(take ? "Take ready. Download it, or record over it." : "That recording produced nothing.");
    if (take) {
      const blob = take.wav || take.compressed;
      engine.loadClip("the take just recorded", await blob.arrayBuffer());
      ui.showClip(engine.clip.name);
      el.play.disabled = false;
    }
    return;
  }
  engine.startRecording();
  el.rec.textContent = "Stop recording";
  el.rec.classList.add("live");
};

el.keep.onclick = async () => {
  const take = engine.keepLast();
  if (!take) { ui.status("Nothing heard yet."); return; }
  ui.showTake(take);
  // It becomes the loaded clip, so Play back runs it through the same analysis
  // a recorded take gets. The ring is left alone: pressing it twice keeps two
  // overlapping windows of the same thirty seconds, not two halves of it.
  engine.loadClip("the last " + take.seconds.toFixed(0) + " seconds", await take.wav.arrayBuffer());
  ui.showClip(engine.clip.name);
  el.play.disabled = false;
  ui.status("Kept the last " + take.seconds.toFixed(0) + " seconds as lossless WAV.");
};

el.play.onclick = async () => {
  if (engine.playing()) {
    engine.stopPlayback();
    el.play.textContent = "Play back";
    if (!engine.listening()) stopLoop();
    settle();
    ui.status("Playback stopped.");
    return;
  }
  if (!engine.clip) return;
  let secs;
  try {
    resetSession();
    secs = await engine.playClip(() => {
      el.play.textContent = "Play back";
      if (!engine.listening()) stopLoop();
      settle();
      ui.status("Playback finished.");
    });
  } catch (e) {
    ui.status("Could not decode " + engine.clip.name + ": " + String(e), true);
    return;
  }
  el.play.textContent = "Stop playback";
  ui.status("Playing " + engine.clip.name + " through the same analysis, " + secs.toFixed(1) + "s");
  runLoop();
};

el.cal.onclick = () => {
  if (calUntil) { calUntil = 0; el.cal.disabled = false; ui.status("Calibration cancelled."); return; }
  calRms.length = 0;
  calUntil = performance.now() + CAL_SECONDS * 1000;
  el.cal.disabled = true;
  ui.calibrating();
};

// Only the figures. The take, the loaded clip and the rewind buffer are
// recordings rather than measurements, and Reset is not a way to lose one.
el.reset.onclick = () => {
  resetSession();
  repaint();
  ui.status(engine.listening() ? "Measurements cleared. Still listening." : "Measurements cleared.");
};

el.download.onclick = () => {
  const name = engine.download(el.format.value);
  ui.status(name ? "Downloaded " + name : "That take has no file in that format.", !name);
};

// --- files ---------------------------------------------------------------
const loadAudio = async f => {
  try {
    engine.loadClip(f.name, await f.arrayBuffer());
    ui.showClip(f.name);
    el.play.disabled = false;
    ui.status("Loaded " + f.name + ". Press Play back.");
  } catch (e) {
    ui.status("Could not read that file: " + String(e), true);
  }
};

el.pickBtn.onclick = () => el.pick.click();
el.pick.onchange = async () => {
  const f = el.pick.files && el.pick.files[0];
  el.pick.value = "";
  if (f) await loadAudio(f);
};

// Dropping a file anywhere on the page loads it, which is one fewer click than
// the picker and is what everyone tries first. A JSON file is a reference.
document.addEventListener("dragover", e => { e.preventDefault(); });
document.addEventListener("drop", async e => {
  e.preventDefault();
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  if (/\.json$/i.test(f.name)) await useReferenceFile(f);
  else await loadAudio(f);
});

// --- teardown ------------------------------------------------------------
// Without this the microphone can outlive the page, and the recording
// indicator stays lit with nothing on screen to say why.
window.addEventListener("pagehide", () => { stopLoop(); engine.teardown(); });

// --- start up ------------------------------------------------------------
if (!window.isSecureContext) el.insecure.hidden = false;
ui.applyTheme(settings.theme);

try {
  shipped = await loadShipped();
  applyAll();
  ui.status("Ready. Press Start and allow the microphone.");
} catch (e) {
  ui.status("Could not load the reference data: " + e.message +
    " The page still runs; the bands and diamonds will be missing.", true);
  applyAll();
}
