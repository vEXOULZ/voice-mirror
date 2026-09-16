// What this browser remembers: the theme, which panels are on, your own pitch
// bands, and a custom reference set if you loaded one.
//
// One key, one object, and the whole thing exports to a file. Settings live in
// this browser only: they are not an account, they do not follow you to
// another machine, and clearing site data clears them. Export is how you move
// them, and it is also the backup.
//
// Every read and write of localStorage is allowed to fail. It throws in a
// private window in some browsers, and losing your theme is not a reason for
// the page to stop working.

export const KEY = "voice-mirror-settings";
export const VERSION = 1;

export const PANELS = [
  ["pitch", "Pitch", true],
  ["formants", "Formants", true],
  ["bright", "Brightness", true],
  ["intone", "Intonation", false],
  ["vtl", "Vocal tract", false],
  ["plane", "Vowel plane", true],
  ["say", "Sentences", true]
];

export const defaults = () => ({
  version: VERSION,
  theme: "system",
  panels: Object.fromEntries(PANELS.map(([k, , d]) => [k, d])),
  // null means "whatever the reference file says", which is the shipped case.
  // An array here is yours and wins over it.
  bands: null,
  reference: null
});

// Anything can be in a file someone hands you, so nothing is trusted: every
// field falls back to the default rather than throwing, because a settings
// file that is half wrong should still give you the half that is right.
export const normalise = raw => {
  const out = defaults();
  if (!raw || typeof raw !== "object") return out;

  if (["system", "light", "dark"].includes(raw.theme)) out.theme = raw.theme;

  if (raw.panels && typeof raw.panels === "object") {
    for (const [k] of PANELS) if (k in raw.panels) out.panels[k] = !!raw.panels[k];
  }

  if (Array.isArray(raw.bands)) {
    const bands = raw.bands
      .map(b => ({
        name: String(b && b.name != null ? b.name : ""),
        low: Number(b && b.low), high: Number(b && b.high),
        color: String(b && b.color ? b.color : "rgba(150,150,150,0.14)")
      }))
      .filter(b => isFinite(b.low) && isFinite(b.high) && b.high > b.low)
      .sort((a, b) => a.low - b.low);
    out.bands = bands.length ? bands : null;
  }

  if (raw.reference && typeof raw.reference === "object") out.reference = raw.reference;
  return out;
};

export const load = () => {
  try {
    return normalise(JSON.parse(window.localStorage.getItem(KEY) || "null"));
  } catch (e) {
    return defaults();
  }
};

export const save = s => {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); return true; }
  catch (e) { return false; }
};

export const clear = () => {
  try { window.localStorage.removeItem(KEY); } catch (e) {}
};

// --- colours -------------------------------------------------------------
// A band is drawn as a translucent wash, and a colour input speaks hex, so the
// two have to meet. The alpha is fixed rather than exposed: a band you can
// tune to opaque stops being a background and starts hiding the trace.
export const BAND_ALPHA = 0.14;

export const hexToBand = hex => {
  const h = String(hex).replace("#", "");
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const v = parseInt(n, 16);
  if (!isFinite(v) || n.length !== 6) return "rgba(150,150,150," + BAND_ALPHA + ")";
  return "rgba(" + ((v >> 16) & 255) + ", " + ((v >> 8) & 255) + ", " + (v & 255) +
         ", " + BAND_ALPHA + ")";
};

// The reverse, for putting the current colour back into the input. Anything
// unparseable comes back mid grey rather than black, which would read as a
// deliberate choice.
export const bandToHex = colour => {
  const m = String(colour).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  const hex = n => Number(n).toString(16).padStart(2, "0");
  if (m) return "#" + hex(m[1]) + hex(m[2]) + hex(m[3]);
  const h = String(colour).match(/^#([0-9a-f]{6})$/i);
  return h ? "#" + h[1] : "#969696";
};

// --- moving them between machines ---------------------------------------
export const toFile = s => JSON.stringify({ ...s, version: VERSION }, null, 1);

export const fromFile = text => {
  let raw;
  try { raw = JSON.parse(text); }
  catch (e) { throw new Error("that file is not JSON: " + e.message); }
  if (!raw || typeof raw !== "object") throw new Error("that file is not a JSON object.");
  // A reference file and a settings file are both JSON and both plausible to
  // hand to either button, so say which this looks like instead of quietly
  // producing a default.
  if (!("theme" in raw) && !("panels" in raw) && !("bands" in raw) && !("reference" in raw)) {
    throw new Error(raw.vowel_reference || raw.pitch_bands
      ? "that looks like a reference file, not a settings file. Load it with Load reference."
      : "no settings in that file.");
  }
  return normalise(raw);
};
