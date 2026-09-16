// The page: what is on it, what it says, and what it remembers.
//
// The markup lives in index.html, so this only finds elements and fills them.
// The version this was ported from had to build every node in JavaScript, and
// most of what that cost is simply gone.

import {
  ZONES, BRIGHT_SCALE, FPS, REF_NAME, TOL, CAL_SECONDS, TRACK_TONE
} from "./constants.js";
import { bark, median, sd, semitones } from "./dsp.js";
import { PANELS, hexToBand, bandToHex } from "./settings.js";

export const $ = id => document.getElementById(id);

export const createUI = () => {
  const ui = {};
  const el = {};
  for (const id of ["start", "rec", "keep", "play", "cal", "reset", "status", "format",
                    "download", "take", "pick", "pickBtn", "clip", "pickRef", "pickRefBtn",
                    "refReset", "refName", "panels", "now", "median", "trace", "share", "legend",
                    "formants", "formantNow", "formantKey",
                    "brightNum", "brightBar", "brightPin", "brightLo", "brightMed", "brightHi",
                    "intoneBig", "intoneSess", "vtlBig", "vtlSess", "refLang", "target",
                    "plane", "hint", "cite", "sayNext", "sayLine", "sources", "theme",
                    "insecure", "bands", "bandAdd", "bandReset", "setExport", "setImport",
                    "setImportFile", "setReset"]) {
    el[id] = $(id);
  }
  ui.el = el;

  // --- theme ------------------------------------------------------------
  // "system" removes the attribute rather than setting one, so the media query
  // in app.css goes back to deciding.
  ui.applyTheme = theme => {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    el.theme.value = theme;
  };

  // --- panels -----------------------------------------------------------
  // Everything can be switched off. All of it at once is more than anyone
  // reads while also trying to speak.
  let hasSentences = false;
  const boxes = {};
  for (const [key, label] of PANELS) {
    const w = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.onchange = () => ui.onPanel && ui.onPanel(key, cb.checked);
    const span = document.createElement("span");
    span.textContent = label;
    w.append(cb, span);
    el.panels.append(w);
    boxes[key] = cb;
  }

  ui.applyPanels = panels => {
    for (const [k] of PANELS) {
      const box = document.querySelector('[data-panel="' + k + '"]');
      // Sentences only exist when a reference supplies some, so its switch
      // disappears rather than offering a panel with nothing in it.
      const absent = k === "say" && !hasSentences;
      if (box) box.hidden = absent || !panels[k];
      boxes[k].checked = !!panels[k];
      boxes[k].parentElement.hidden = absent;
    }
  };

  ui.panelShown = key => {
    const box = document.querySelector('[data-panel="' + key + '"]');
    return box && !box.hidden;
  };

  // --- the pitch band editor --------------------------------------------
  // Rows are rebuilt from the list on every change that alters their number,
  // and edited in place otherwise, so typing in a field does not lose focus.
  ui.renderBands = (bands, custom) => {
    el.bands.replaceChildren();
    bands.forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "band";

      const name = document.createElement("input");
      name.type = "text"; name.value = b.name; name.placeholder = "Name";
      const low = document.createElement("input");
      low.type = "number"; low.value = b.low; low.min = 40; low.max = 600; low.step = 1;
      const high = document.createElement("input");
      high.type = "number"; high.value = b.high; high.min = 40; high.max = 600; high.step = 1;
      const colour = document.createElement("input");
      colour.type = "color"; colour.value = bandToHex(b.color);
      colour.title = "Drawn translucent, so it stays behind the trace.";
      const drop = document.createElement("button");
      drop.className = "ghost drop"; drop.textContent = "Remove";

      const to = document.createElement("span"); to.textContent = "to";
      const hz = document.createElement("span"); hz.textContent = "Hz";

      // A band is only committed when it makes sense: low under high, both
      // numbers. A half-typed value is left in the field without redrawing the
      // trace against it.
      const commit = () => {
        const lo = Number(low.value), hi = Number(high.value);
        const ok = isFinite(lo) && isFinite(hi) && hi > lo;
        low.style.borderColor = high.style.borderColor = ok ? "" : "var(--warn)";
        if (!ok) return;
        ui.onBand && ui.onBand(i, { name: name.value, low: lo, high: hi, color: hexToBand(colour.value) });
      };
      name.oninput = commit; low.oninput = commit; high.oninput = commit; colour.oninput = commit;
      drop.onclick = () => ui.onBandRemove && ui.onBandRemove(i);

      row.append(name, low, to, high, hz, colour, drop);
      el.bands.append(row);
    });
    el.bandReset.disabled = !custom;
  };

  // --- the share bar ----------------------------------------------------
  const cells = ZONES.map(([, colour]) => {
    const c = document.createElement("div");
    c.style.background = colour;
    el.share.append(c);
    return c;
  });
  const legendEls = ZONES.map(([name, colour]) => {
    const s = document.createElement("span");
    s.innerHTML = '<i style="background:' + colour + '"></i>' + name + " <b>-</b>";
    el.legend.append(s);
    return s.querySelector("b");
  });

  // --- the formant key --------------------------------------------------
  const formantEls = TRACK_TONE.map(([name, colour]) => {
    const s = document.createElement("span");
    s.innerHTML = '<i style="background:' + colour + '"></i>' + name + " <b>-</b>";
    el.formantKey.append(s);
    return s.querySelector("b");
  });

  el.brightLo.textContent = BRIGHT_SCALE[0] + " Hz";
  el.brightHi.textContent = BRIGHT_SCALE[1] + " Hz";

  // --- status -----------------------------------------------------------
  ui.status = (text, bad) => {
    el.status.textContent = text;
    el.status.classList.toggle("bad", !!bad);
  };

  // --- reference --------------------------------------------------------
  ui.fillReference = (ref, langs, want, custom) => {
    el.refLang.replaceChildren();
    for (const l of langs) {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = ref.languages[l] || l;
      el.refLang.append(o);
    }
    el.refLang.value = langs.includes(want) ? want : (langs[0] || "");
    ui.fillTargets(ref);
    ui.showSources(ref);
    hasSentences = ref.sentences.length > 0;
    ui.sentences = ref.sentences;
    ui.sayAt = 0;
    ui.showSentence();
    el.refReset.disabled = !custom;
    el.refName.textContent = custom ? "using " + (ref.name || "a custom reference") : "using the shipped reference";
  };

  // Target starts at None and stays there until you choose. Which reference
  // point is a goal is yours and your clinician's, so the tool never opens
  // with one selected.
  ui.fillTargets = ref => {
    const keep = el.target.value;
    el.target.replaceChildren();
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "None";
    el.target.append(none);
    for (const v of ref.vowels.filter(v => v.lang === el.refLang.value)) {
      const o = document.createElement("option");
      o.value = v.lang + "|" + v.vowel;
      o.textContent = v.vowel + "  (" + v.word + ")";
      el.target.append(o);
    }
    el.target.value = [...el.target.options].some(o => o.value === keep) ? keep : "";
  };

  ui.targetOf = ref => {
    const parts = String(el.target.value).split("|");
    if (parts.length !== 2) return null;
    return ref.vowels.find(v => v.lang === parts[0] && v.vowel === parts[1]) || null;
  };

  ui.showSources = ref => {
    el.cite.textContent = ref.sources[el.refLang.value] || "";
    el.sources.textContent = [ref.name, ref.sources.pitch_bands].filter(Boolean).join("  ");
  };

  ui.showSentence = () => {
    if (!ui.sentences || !ui.sentences.length) { el.sayLine.textContent = ""; return; }
    el.sayLine.textContent = ui.sentences[ui.sayAt % ui.sentences.length];
  };

  // --- readouts ---------------------------------------------------------
  // A figure left on screen from the previous pass reads as this pass's, so
  // the readouts are blanked with the arrays behind them rather than waiting
  // for the next frame to overwrite them.
  ui.blank = () => {
    el.now.textContent = "-";
    el.median.textContent = "";
    cells.forEach(c => { c.style.width = "0%"; });
    legendEls.forEach(e => { e.textContent = "-"; });
    formantEls.forEach(e => { e.textContent = "-"; });
    el.formantNow.textContent = "-";
    el.brightNum.textContent = "-";
    el.brightPin.style.left = "0%";
    el.brightMed.textContent = "";
    el.intoneBig.textContent = "-"; el.intoneSess.textContent = "-";
    el.vtlBig.textContent = "-"; el.vtlSess.textContent = "-";
  };

  ui.readouts = (hz, s, formant) => {
    el.now.textContent = hz == null ? "-" : Math.round(hz) + " Hz";
    if (s.voiced.length) {
      el.median.textContent = "median " + Math.round(median(s.voiced)) + " Hz over " +
        (s.voiced.length / FPS).toFixed(0) + "s voiced";
      const total = s.voiced.length;
      s.counts.forEach((n, i) => {
        const pct = 100 * n / total;
        cells[i].style.width = pct.toFixed(1) + "%";
        legendEls[i].textContent = pct.toFixed(0) + "%";
      });
    }
    // The latest frame's formants beside their colours, blank when that frame
    // was unvoiced, and the session medians in the corner.
    formantEls.forEach((e, k) => {
      e.textContent = formant && formant[k] != null ? Math.round(formant[k]) + " Hz" : "-";
    });
    if (s.formantMed.some(v => v != null)) {
      el.formantNow.textContent = "medians " +
        s.formantMed.map(v => (v == null ? "-" : Math.round(v))).join(" / ") + " Hz";
    }
    if (s.brights.length) {
      const b = s.brights[s.brights.length - 1];
      el.brightNum.textContent = Math.round(b) + " Hz";
      const f = (b - BRIGHT_SCALE[0]) / (BRIGHT_SCALE[1] - BRIGHT_SCALE[0]);
      el.brightPin.style.left = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + "%";
      el.brightMed.textContent = "median " + Math.round(median(s.brights)) + " Hz";
    }
    // Standard deviation of f0 in semitones, the same quantity the offline
    // measure holds. Over the last ten seconds, because how much your pitch is
    // moving now is the trainable thing; the session figure sits beside it.
    if (s.voiced.length > 4) {
      const win = sd(s.f0Recent.map(r => semitones(r[1])));
      el.intoneBig.textContent = win == null ? "-" : win.toFixed(2);
      el.intoneSess.textContent = "session " + sd(s.voiced.map(semitones)).toFixed(2) + " ST";
    }
    if (s.vtls.length) {
      el.vtlBig.textContent = s.vtls[s.vtls.length - 1].toFixed(1);
      el.vtlSess.textContent = "median " + median(s.vtls).toFixed(1) + " cm over " +
        s.vtls.length + " vowels";
    }
  };

  // --- the advice under the plane ---------------------------------------
  // The levers are the standard ones: F1 answers to jaw and tongue height, F2
  // to tongue front-to-back and to lip rounding. Nothing new is claimed here.
  ui.advise = (tgt, tracker) => {
    if (!tgt) {
      el.hint.textContent = tracker.target
        ? "No target chosen. The dot is the last vowel you held."
        : "No target chosen. Sustain a vowel and the dot appears.";
      return;
    }
    if (!tracker.target) {
      el.hint.textContent = "Sustain a vowel. The dot moves on held vowels, not on transitions.";
      return;
    }
    // Read off the position being drawn: a number that disagreed with the dot
    // would be worse than either on its own.
    const lines = [];
    for (const k of ["w", "m"]) {
      const d1 = bark(tgt[k + "_f1"]) - bark(tracker.target[0]);
      const d2 = bark(tgt[k + "_f2"]) - bark(tracker.target[1]);
      const say = [];
      if (d1 > TOL) say.push("open the jaw, or lower the tongue");
      else if (d1 < -TOL) say.push("close the jaw, or raise the tongue");
      if (d2 > TOL) say.push("tongue forward, or unround the lips");
      else if (d2 < -TOL) say.push("tongue back, or round the lips");
      lines.push(REF_NAME[k] + "  F1 " + Math.round(tgt[k + "_f1"]) + ", F2 " +
        Math.round(tgt[k + "_f2"]) + "  ·  " + Math.hypot(d1, d2).toFixed(2) + " Bark  ·  " +
        (say.length ? say.join("; ") : "on target"));
    }
    el.hint.textContent = "you  F1 " + Math.round(tracker.target[0]) +
      ", F2 " + Math.round(tracker.target[1]) +
      (tracker.steady ? "" : "   (not steady yet)") + "\n" + lines.join("\n");
  };

  // --- what a take is, in words -----------------------------------------
  ui.showTake = take => {
    el.format.disabled = !take;
    el.download.disabled = !take;
    if (!take) { el.take.textContent = "nothing recorded yet"; return; }
    const has = [];
    if (take.wav) has.push("WAV");
    if (take.compressed) has.push("compressed");
    // The option is greyed rather than hidden: a take that exists in one
    // format only should say which, not quietly offer the other.
    for (const o of el.format.options) {
      o.disabled = o.value === "wav" ? !take.wav : !take.compressed;
    }
    if (el.format.selectedOptions[0] && el.format.selectedOptions[0].disabled) {
      el.format.value = take.wav ? "wav" : "webm";
    }
    const secs = take.seconds ? ", " + take.seconds.toFixed(0) + "s" : "";
    el.take.textContent = "take ready" + secs + ": " + has.join(" and ") +
      (take.capped ? "  (the lossless copy stopped at the cap)" : "");
  };

  ui.showClip = name => {
    el.clip.textContent = name ? "loaded " + name : "nothing loaded";
  };

  ui.calibrating = () => ui.status("Calibrating. Stay quiet for " + CAL_SECONDS + " seconds.");

  ui.blank();
  return ui;
};
