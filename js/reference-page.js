// The reference page: the file format, read from data/reference.md (or its
// Portuguese copy) so there is one copy of each, and the shipped sets as
// tables you can read here or take away as a file to edit.

import { REFERENCE_URL } from "./reference.js";
import { renderMarkdown } from "./markdown.js";
import { load, save } from "./settings.js";
import { t, td, setLang, applyStatic, wireSwitch } from "./i18n.js";
import { saveJson } from "./save.js";

const $ = id => document.getElementById(id);

// Same theme and language as the page you came from.
const settings = load();
if (settings.theme === "light" || settings.theme === "dark") {
  document.documentElement.dataset.theme = settings.theme;
}
setLang(settings.lang);

const node = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

// One language on its own is a complete reference file: the shipped bands,
// that language's vowels, and the citations for both. Loading it in the page
// gives the same picture as the shipped file with only that language picked.
// The file keeps the data's own wording, whatever language the page is in, so
// the same download always comes out the same.
const standalone = (data, lang) => ({
  name: "Shipped reference, " + (data.languages[lang] || lang),
  note: data.note,
  sources: { pitch_bands: data.sources.pitch_bands, [lang]: data.sources[lang] },
  pitch_bands: data.pitch_bands,
  vowel_reference: data.vowel_reference.filter(v => v.lang === lang),
  languages: { [lang]: data.languages[lang] || lang },
  sentences: []
});

const jsonText = obj => JSON.stringify(obj, null, 2) + "\n";

const table = (head, rows) => node("div", { className: "table-wrap" }, node("table", {},
  node("thead", {}, node("tr", {}, ...head.map(([text, cls]) => node("th", { className: cls || "" }, text)))),
  node("tbody", {}, ...rows.map(r => node("tr", {}, ...r)))));

const vowelTable = rows => table(
  [[t("rp.col.vowel")], [t("rp.col.word")], [t("rp.col.mf1"), "num"], [t("rp.col.mf2"), "num"],
   [t("rp.col.wf1"), "num"], [t("rp.col.wf2"), "num"]],
  rows.map(v => [
    node("td", { className: "ipa" }, v.vowel), node("td", {}, v.word),
    ...[v.m_f1, v.m_f2, v.w_f1, v.w_f2].map(n => node("td", { className: "num" }, String(Math.round(n))))
  ]));

const jsonView = obj => node("details", { className: "json" },
  node("summary", {}, t("rp.showJson")),
  node("pre", {}, node("code", {}, jsonText(obj))));

let data = null;

const renderSets = () => {
  const box = $("sets");
  box.replaceChildren();
  const langs = [...new Set(data.vowel_reference.map(v => v.lang))];

  for (const lang of langs) {
    const file = standalone(data, lang);
    const fname = "voice-mirror-reference-" + lang + ".json";
    const btn = node("button", { className: "primary", type: "button" }, t("rp.download", { file: fname }));
    btn.onclick = () => saveJson(jsonText(file), fname);
    box.append(node("article", { className: "set" },
      node("div", { className: "set-head" },
        node("h3", {}, td(data.languages[lang] || lang)),
        node("span", { className: "dim" }, t("rp.vowels", { n: file.vowel_reference.length }))),
      node("p", { className: "faint" }, data.sources[lang] || ""),
      vowelTable(file.vowel_reference),
      node("div", { className: "bar" }, btn),
      jsonView(file)));
  }

  const bands = table(
    [[t("rp.col.band")], [t("rp.col.low"), "num"], [t("rp.col.high"), "num"]],
    data.pitch_bands.map(b => [
      node("td", {}, node("i", { className: "swatch", style: "background:" + b.color.replace(/[\d.]+\)$/, "1)") }), td(b.name)),
      node("td", { className: "num" }, b.low + " Hz"), node("td", { className: "num" }, b.high + " Hz")
    ]));
  const all = node("a", { className: "button", href: REFERENCE_URL, download: "reference.json" },
    t("rp.downloadBoth"));
  box.append(node("article", { className: "set" },
    node("div", { className: "set-head" }, node("h3", {}, t("rp.bands")),
      node("span", { className: "dim" }, t("rp.inBoth"))),
    node("p", { className: "faint" }, td(data.sources.pitch_bands || "")),
    bands,
    node("div", { className: "bar" }, all),
    jsonView(data)));
};

const fail = (where, e) => {
  $(where).replaceChildren(node("p", { className: "warn" }, t("rp.failed", { error: e.message })));
};

const get = async (url, as) => {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(t("err.status", { url, code: r.status }));
  return r[as]();
};

// Switching language twice quickly starts two fetches, and only the one
// asked for last may write.
let formatAsked = 0;
const renderFormat = () => {
  const mine = ++formatAsked;
  return get(t("rp.md"), "text")
    .then(md => { if (mine === formatAsked) $("format").innerHTML = renderMarkdown(md, 1); })
    .catch(e => { if (mine === formatAsked) fail("format", e); });
};

const render = () => {
  applyStatic(document);
  if (data) renderSets();
  renderFormat();
};

wireSwitch($("lang"), lang => {
  // Read fresh, so a change made in the other tab since this one opened is
  // not overwritten with this tab's old copy.
  const s = load();
  s.lang = lang;
  save(s);
  setLang(lang);
  render();
});

render();
get(REFERENCE_URL, "json")
  .then(d => { data = d; renderSets(); })
  .catch(e => fail("sets", e));
