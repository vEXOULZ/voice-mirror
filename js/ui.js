// The page: what is on it, what it says, and what it remembers.
//
// The markup lives in index.html, so this only finds elements and fills them.
// The version this was ported from had to build every node in JavaScript, and
// most of what that cost is simply gone.

import {
  ZONES, BRIGHT_SCALE, FPS, TOL, CAL_SECONDS, TRACK_TONE
} from "./constants.js";
import { t, td, applyStatic } from "./i18n.js";
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
                    "plane", "hint", "cite", "sayNext", "sayLine", "sources", "theme", "lang",
                    "insecure", "bands", "bandAdd", "bandReset", "setExport", "setImport",
                    "setImportFile", "setReset"]) {
    el[id] = $(id);
  }
  ui.el = el;

  // --- the (i) buttons --------------------------------------------------
  // Each one shows or hides the element its aria-controls names. Delegated
  // from the document, so a button added later needs no wiring of its own.
  document.addEventListener("click", e => {
    const btn = e.target.closest && e.target.closest("button.info");
    if (!btn) return;
    const box = document.getElementById(btn.getAttribute("aria-controls"));
    if (!box) return;
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    box.hidden = !open;
  });

  // --- theme ------------------------------------------------------------
  // "system" removes the attribute rather than setting one, so the media query
  // in app.css goes back to deciding.
  ui.applyTheme = theme => {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    for (const r of el.theme.querySelectorAll("input")) r.checked = r.value === theme;
  };

  // --- the settings popover ---------------------------------------------
  // It opens over the page from the header instead of pushing the panels
  // down, so it costs no height while closed. Escape, Done, or a click
  // outside it closes it.
  const settingsBox = $("settings");
  const closeSettings = () => {
    if (!settingsBox.open) return;
    settingsBox.open = false;
    settingsBox.querySelector("summary").focus();
  };
  $("setClose").onclick = closeSettings;
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); });
  document.addEventListener("pointerdown", e => {
    if (settingsBox.open && !settingsBox.contains(e.target)) settingsBox.open = false;
  });

  // --- panels -----------------------------------------------------------
  // Everything can be switched off. All of it at once is more than anyone
  // reads while also trying to speak.
  let hasSentences = false;
  const boxes = {};
  const panelLabels = {};
  for (const [key] of PANELS) {
    const w = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.onchange = () => ui.onPanel && ui.onPanel(key, cb.checked);
    const span = document.createElement("span");
    panelLabels[key] = span;
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
      name.type = "text"; name.value = b.name; name.placeholder = t("band.name");
      const low = document.createElement("input");
      low.type = "number"; low.value = b.low; low.min = 40; low.max = 600; low.step = 1;
      const high = document.createElement("input");
      high.type = "number"; high.value = b.high; high.min = 40; high.max = 600; high.step = 1;
      const colour = document.createElement("input");
      colour.type = "color"; colour.value = bandToHex(b.color);
      colour.title = t("band.colour");
      const drop = document.createElement("button");
      drop.className = "ghost drop"; drop.textContent = t("band.remove");

      const to = document.createElement("span"); to.textContent = t("band.to");
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
  // The zone names are their own element, so a change of language can rename
  // them without touching the figure beside each.
  const zoneNames = [];
  const legendEls = ZONES.map(([, colour], i) => {
    const s = document.createElement("span");
    s.innerHTML = '<i style="background:' + colour + '"></i><span></span> <b>-</b>';
    zoneNames[i] = s.querySelector("span");
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
  // Given a function rather than a string, so the line can be said again in
  // another language without whoever set it having to know.
  let lastStatus = null;
  const said = say => (typeof say === "function" ? say() : say);
  ui.status = (say, bad) => {
    lastStatus = say;
    el.status.textContent = said(say);
    el.status.classList.toggle("bad", !!bad);
  };

  // --- language ---------------------------------------------------------
  // Everything with words in it, redone. The readouts fill themselves on the
  // next frame, or from settle() when nothing is running.
  let lastTake = null, lastClip = null, lastRef = null;
  ui.relabel = () => {
    applyStatic(document);
    for (const [k] of PANELS) panelLabels[k].textContent = t("panel." + k);
    zoneNames.forEach((n, i) => { n.textContent = t("zone." + i); });
    if (lastStatus) el.status.textContent = said(lastStatus);
    ui.showTake(lastTake);
    ui.showClip(lastClip);
    if (lastRef) ui.fillReference(...lastRef);
  };

  // --- reference --------------------------------------------------------
  ui.fillReference = (ref, langs, want, custom, customBands) => {
    lastRef = [ref, langs, want, custom, customBands];
    el.refLang.replaceChildren();
    for (const l of langs) {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = td(ref.languages[l] || l);
      el.refLang.append(o);
    }
    el.refLang.value = langs.includes(want) ? want : (langs[0] || "");
    ui.fillTargets(ref);
    ui.showSources(ref, customBands);
    hasSentences = ref.sentences.length > 0;
    ui.sentences = ref.sentences;
    ui.sayAt = 0;
    ui.showSentence();
    el.refReset.disabled = !custom;
    el.refName.textContent = custom ? t("ref.using", { name: ref.name || t("ref.usingCustom") })
                                    : t("ref.usingShipped");
  };

  // Target starts at None and stays there until you choose. Which reference
  // point is a goal is yours and your clinician's, so the tool never opens
  // with one selected.
  ui.fillTargets = ref => {
    const keep = el.target.value;
    el.target.replaceChildren();
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t("ref.none");
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

  // Two separate statements, each its own sentence: which reference is in use,
  // and where the pitch bands on screen came from. Bands you set yourself say
  // so, rather than crediting a source they no longer come from.
  ui.showSources = (ref, customBands) => {
    el.cite.textContent = ref.sources[el.refLang.value] || "";
    const parts = [];
    if (ref.name) parts.push(t("src.reference", { name: td(ref.name).replace(/\.$/, "") }));
    if (customBands) parts.push(t("src.bandsOwn"));
    else if (ref.sources.pitch_bands) parts.push(t("src.bands", { text: td(ref.sources.pitch_bands) }));
    el.sources.textContent = parts.join(" ");
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
    el.now.textContent = "—";
    el.median.textContent = "";
    cells.forEach(c => { c.style.width = "0%"; });
    legendEls.forEach(e => { e.textContent = "—"; });
    formantEls.forEach(e => { e.textContent = "—"; });
    el.formantNow.textContent = "—";
    el.brightNum.textContent = "—";
    el.brightPin.classList.remove("off-low", "off-high");
    el.brightPin.style.left = "0%";
    el.brightMed.textContent = "";
    el.intoneBig.textContent = "—"; el.intoneSess.textContent = "—";
    el.vtlBig.textContent = "—"; el.vtlSess.textContent = "—";
  };

  ui.readouts = (hz, s, formant) => {
    el.now.textContent = hz == null ? "—" : Math.round(hz) + " Hz";
    if (s.voiced.length) {
      // Whole seconds hid anything under half of one, printing "over 0s" beside
      // a real median. One decimal until there is enough time for it not to
      // matter.
      const secs = s.voiced.length / FPS;
      el.median.textContent = t("read.median", {
        hz: Math.round(median(s.voiced)), secs: secs.toFixed(secs < 10 ? 1 : 0)
      });
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
      e.textContent = formant && formant[k] != null ? Math.round(formant[k]) + " Hz" : "—";
    });
    if (s.formantMed.some(v => v != null)) {
      el.formantNow.textContent = t("read.medians", {
        values: s.formantMed.map(v => (v == null ? "—" : Math.round(v))).join(" / ")
      });
    }
    if (s.brights.length) {
      const b = s.brights[s.brights.length - 1];
      const f = (b - BRIGHT_SCALE[0]) / (BRIGHT_SCALE[1] - BRIGHT_SCALE[0]);
      // Off either end, the pin turns into an arrow pointing off the bar and
      // the number says so. Parked at the edge, 400 Hz looked like 600.
      const low = f < 0, high = f > 1;
      el.brightPin.classList.toggle("off-low", low);
      el.brightPin.classList.toggle("off-high", high);
      el.brightNum.textContent = Math.round(b) + " Hz" +
        (low ? t("read.below") : high ? t("read.above") : "");
      el.brightPin.style.left = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + "%";
      el.brightMed.textContent = t("read.brightMedian", { hz: Math.round(median(s.brights)) });
    }
    // Standard deviation of f0 in semitones, the same quantity the offline
    // measure holds. Over the last ten seconds, because how much your pitch is
    // moving now is the trainable thing; the session figure sits beside it.
    if (s.voiced.length > 4) {
      const win = sd(s.f0Recent.map(r => semitones(r[1])));
      el.intoneBig.textContent = win == null ? "—" : win.toFixed(2);
      el.intoneSess.textContent = t("read.session", { sd: sd(s.voiced.map(semitones)).toFixed(2) });
    }
    if (s.vtls.length) {
      el.vtlBig.textContent = s.vtls[s.vtls.length - 1].toFixed(1);
      el.vtlSess.textContent = t("read.vtlMedian", { cm: median(s.vtls).toFixed(1), n: s.vtls.length });
    }
  };

  // --- the advice under the plane ---------------------------------------
  // The levers are the standard ones: F1 answers to jaw and tongue height, F2
  // to tongue front-to-back and to lip rounding. Nothing new is claimed here.
  ui.advise = (tgt, tracker) => {
    if (!tgt) {
      el.hint.textContent = tracker.target
        ? t("hint.noTargetDot")
        : t("hint.noTarget");
      return;
    }
    if (!tracker.target) {
      el.hint.textContent = t("hint.sustain");
      return;
    }
    // Read off the position being drawn: a number that disagreed with the dot
    // would be worse than either on its own.
    const lines = [];
    for (const k of ["w", "m"]) {
      const d1 = bark(tgt[k + "_f1"]) - bark(tracker.target[0]);
      const d2 = bark(tgt[k + "_f2"]) - bark(tracker.target[1]);
      const say = [];
      if (d1 > TOL) say.push(t("hint.open"));
      else if (d1 < -TOL) say.push(t("hint.close"));
      if (d2 > TOL) say.push(t("hint.forward"));
      else if (d2 < -TOL) say.push(t("hint.back"));
      lines.push(t(k === "w" ? "hint.women" : "hint.men") + "  F1 " + Math.round(tgt[k + "_f1"]) + ", F2 " +
        Math.round(tgt[k + "_f2"]) + "  ·  " + Math.hypot(d1, d2).toFixed(2) + " Bark  ·  " +
        (say.length ? say.join("; ") : t("hint.onTarget")));
    }
    el.hint.textContent = t("hint.you") + "  F1 " + Math.round(tracker.target[0]) +
      ", F2 " + Math.round(tracker.target[1]) +
      (tracker.steady ? "" : t("hint.notSteady")) + "\n" + lines.join("\n");
  };

  // --- what a take is, in words -----------------------------------------
  ui.showTake = take => {
    lastTake = take;
    el.format.disabled = !take;
    el.download.disabled = !take;
    if (!take) { el.take.textContent = t("take.none"); return; }
    const has = [];
    if (take.wav) has.push(t("take.wav"));
    if (take.compressed) has.push(t("take.compressed"));
    // The option is greyed rather than hidden: a take that exists in one
    // format only should say which, not quietly offer the other.
    for (const o of el.format.options) {
      o.disabled = o.value === "wav" ? !take.wav : !take.compressed;
    }
    if (el.format.selectedOptions[0] && el.format.selectedOptions[0].disabled) {
      el.format.value = take.wav ? "wav" : "webm";
    }
    const secs = take.seconds ? ", " + take.seconds.toFixed(0) + "s" : "";
    el.take.textContent = t("take.ready", { secs, formats: has.join(t("take.and")) }) +
      (take.capped ? t("take.capped") : "");
  };

  ui.showClip = name => {
    lastClip = name;
    el.clip.textContent = name ? t("clip.loaded", { name }) : t("clip.none");
  };

  ui.calibrating = () => ui.status(() => t("status.calibrating", { secs: CAL_SECONDS }));

  ui.blank();
  return ui;
};
