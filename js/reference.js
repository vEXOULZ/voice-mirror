// Where the bands and the diamonds come from, and what happens when a file
// cannot supply them.
//
// Nothing loaded here is uploaded, stored or sent anywhere. The shipped file
// is fetched from this site; a file you pick is read in the browser and
// forgotten when the tab closes.

import { t } from "./i18n.js";

export const REFERENCE_URL = "data/reference.json";

// A row has to carry both reference sets or it cannot be drawn. A row that
// half parses is dropped and counted rather than drawn at zero, which would
// put a diamond in the corner of the plane and look like a measurement.
const cleanVowels = rows => {
  const out = [], bad = [];
  for (const v of rows || []) {
    const rec = {
      lang: String(v.lang ?? ""), vowel: String(v.vowel ?? ""), word: String(v.word ?? ""),
      m_f1: Number(v.m_f1), m_f2: Number(v.m_f2), w_f1: Number(v.w_f1), w_f2: Number(v.w_f2)
    };
    const ok = rec.lang && rec.vowel &&
      [rec.m_f1, rec.m_f2, rec.w_f1, rec.w_f2].every(n => isFinite(n) && n > 0);
    (ok ? out : bad).push(ok ? rec : (rec.vowel || JSON.stringify(v)));
  }
  return { rows: out, bad };
};

const cleanBands = rows => (rows || [])
  .map(b => ({ name: String(b.name ?? ""), low: Number(b.low), high: Number(b.high),
               color: String(b.color ?? "rgba(150,150,150,.15)") }))
  .filter(b => isFinite(b.low) && isFinite(b.high) && b.high > b.low)
  .sort((a, b) => a.low - b.low);

// Two bands read as islands give five zones: below the lower, the lower, the
// gap, the upper, above the upper. They partition, which is why they sum to
// 100 where overlapping ranges would not.
export const zoneEdges = bands => {
  if (!bands.length) return [];
  const lo = bands[0], hi = bands[bands.length - 1];
  return [[null, lo.low], [lo.low, lo.high], [lo.high, hi.low], [hi.low, hi.high], [hi.high, null]];
};

// Throws with a readable message rather than returning something half usable:
// the caller keeps whatever it already had and prints what went wrong.
export const parseReference = raw => {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error(t("err.notJson", { error: e.message }));
  }
  if (!data || typeof data !== "object") throw new Error(t("err.notObject"));

  const bands = cleanBands(data.pitch_bands);
  const { rows, bad } = cleanVowels(data.vowel_reference);
  if (!bands.length && !rows.length) {
    throw new Error(t("err.nothingUsable"));
  }

  return {
    name: String(data.name ?? ""),
    bands,
    vowels: rows,
    dropped: bad,
    languages: data.languages && typeof data.languages === "object" ? data.languages : {},
    sentences: Array.isArray(data.sentences) ? data.sentences.map(String) : [],
    sources: data.sources && typeof data.sources === "object" ? data.sources : {}
  };
};

export const loadShipped = async () => {
  const res = await fetch(REFERENCE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("err.status", { url: REFERENCE_URL, code: res.status }));
  return parseReference(await res.text());
};

export const langsOf = ref => [...new Set(ref.vowels.map(v => v.lang))].sort();
