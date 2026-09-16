// The reference page: the file format, read from data/reference.md so there is
// one copy of it, and the shipped sets as tables you can read here or take
// away as a file to edit.

import { REFERENCE_URL } from "./reference.js";
import { renderMarkdown } from "./markdown.js";
import { load } from "./settings.js";

const $ = id => document.getElementById(id);

// Same theme as the page you came from.
const theme = load().theme;
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

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

const node = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

// One language on its own is a complete reference file: the shipped bands,
// that language's vowels, and the citations for both. Loading it in the page
// gives the same picture as the shipped file with only that language picked.
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

const vowelTable = rows => {
  const head = ["Vowel", "Word", "Men F1", "Men F2", "Women F1", "Women F2"];
  return node("div", { className: "table-wrap" }, node("table", {},
    node("thead", {}, node("tr", {}, ...head.map((h, i) =>
      node("th", { className: i > 1 ? "num" : "" }, h)))),
    node("tbody", {}, ...rows.map(v => node("tr", {},
      node("td", { className: "ipa" }, v.vowel), node("td", {}, v.word),
      ...[v.m_f1, v.m_f2, v.w_f1, v.w_f2].map(n =>
        node("td", { className: "num" }, String(Math.round(n)))))))));
};

const jsonView = obj => node("details", { className: "json" },
  node("summary", {}, "Show the JSON"),
  node("pre", {}, node("code", {}, jsonText(obj))));

const renderSets = data => {
  const box = $("sets");
  box.replaceChildren();
  const langs = [...new Set(data.vowel_reference.map(v => v.lang))];

  for (const lang of langs) {
    const file = standalone(data, lang);
    const fname = "voice-mirror-reference-" + lang + ".json";
    const btn = node("button", { className: "primary", type: "button" }, "Download " + fname);
    btn.onclick = () => saveFile(jsonText(file), fname);
    box.append(node("article", { className: "set" },
      node("div", { className: "set-head" },
        node("h3", {}, data.languages[lang] || lang),
        node("span", { className: "dim" }, file.vowel_reference.length + " vowels")),
      node("p", { className: "faint" }, data.sources[lang] || ""),
      vowelTable(file.vowel_reference),
      node("div", { className: "bar" }, btn),
      jsonView(file)));
  }

  const bands = node("div", { className: "table-wrap" }, node("table", {},
    node("thead", {}, node("tr", {}, node("th", {}, "Band"),
      node("th", { className: "num" }, "Low"), node("th", { className: "num" }, "High"))),
    node("tbody", {}, ...data.pitch_bands.map(b => node("tr", {},
      node("td", {}, node("i", { className: "swatch", style: "background:" + b.color.replace(/[\d.]+\)$/, "1)") }), b.name),
      node("td", { className: "num" }, b.low + " Hz"), node("td", { className: "num" }, b.high + " Hz"))))));
  const all = node("a", { className: "button", href: REFERENCE_URL, download: "reference.json" },
    "Download both, as reference.json");
  box.append(node("article", { className: "set" },
    node("div", { className: "set-head" }, node("h3", {}, "Pitch bands"),
      node("span", { className: "dim" }, "in both files")),
    node("p", { className: "faint" }, data.sources.pitch_bands || ""),
    bands,
    node("div", { className: "bar" }, all),
    jsonView(data)));
};

const fail = (where, e) => {
  $(where).replaceChildren(node("p", { className: "warn" }, "Could not load this: " + e.message));
};

fetch(REFERENCE_URL, { cache: "no-cache" })
  .then(r => { if (!r.ok) throw new Error(REFERENCE_URL + " came back " + r.status); return r.json(); })
  .then(renderSets)
  .catch(e => fail("sets", e));

fetch("data/reference.md", { cache: "no-cache" })
  .then(r => { if (!r.ok) throw new Error("data/reference.md came back " + r.status); return r.text(); })
  .then(md => { $("format").innerHTML = renderMarkdown(md, 1); })
  .catch(e => fail("format", e));
