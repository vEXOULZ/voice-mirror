// The page's language.
//
// The English words on the page live where they are shown: in the HTML, for
// everything fixed, and in lang/en.js for what the scripts write. A fixed
// element carries data-i18n="key" and its English is read back out of the
// markup the first time it is translated, so there is no second English copy
// to drift from the first. Other languages supply every key in their own file.
//
//   data-i18n="key"                   the element's content (may hold markup)
//   data-i18n-attr="aria-label:key"   attributes, comma separated
//
// Placeholders in a string are {name}, filled from the object passed to t().

import en from "./lang/en.js";
import pt from "./lang/pt.js";

export const LANGS = { en: { dict: en, html: "en" }, pt: { dict: pt, html: "pt-BR" } };

let lang = "en";

export const detectLang = () => {
  const prefs = navigator.languages || [navigator.language || "en"];
  for (const p of prefs) {
    const k = String(p).slice(0, 2).toLowerCase();
    if (k in LANGS) return k;
  }
  return "en";
};

export const getLang = () => lang;
export const setLang = l => {
  lang = l in LANGS ? l : detectLang();
  document.documentElement.lang = LANGS[lang].html;
  return lang;
};

const fill = (text, vars) => vars
  ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  : text;

// A missing key falls back to English, then to the key itself, which is ugly
// on purpose: it shows up on screen instead of hiding.
export const t = (key, vars) => {
  const d = LANGS[lang].dict;
  return fill(key in d ? d[key] : key in en ? en[key] : key, vars);
};

// Text that arrives in a data file rather than from the page: the shipped
// band names and language names. Anything not listed passes through as it
// was written, so your own band called "Target" stays "Target".
export const td = text => {
  const d = LANGS[lang].dict.data || {};
  return text in d ? d[text] : text;
};

const originalHtml = new WeakMap();
const originalAttr = new WeakMap();

export const applyStatic = (root = document) => {
  const d = LANGS[lang].dict;
  for (const n of root.querySelectorAll("[data-i18n]")) {
    if (!originalHtml.has(n)) originalHtml.set(n, n.innerHTML);
    const key = n.dataset.i18n;
    n.innerHTML = lang !== "en" && key in d ? d[key] : originalHtml.get(n);
  }
  for (const n of root.querySelectorAll("[data-i18n-attr]")) {
    if (!originalAttr.has(n)) originalAttr.set(n, {});
    const saved = originalAttr.get(n);
    for (const pair of n.dataset.i18nAttr.split(",")) {
      const [attr, key] = pair.split(":").map(x => x.trim());
      if (!(attr in saved)) saved[attr] = n.getAttribute(attr);
      n.setAttribute(attr, lang !== "en" && key in d ? d[key] : saved[attr]);
    }
  }
};

// The EN / PT switch. Same markup on both pages, so one function wires it.
export const wireSwitch = (box, onChange) => {
  for (const r of box.querySelectorAll("input")) r.checked = r.value === lang;
  box.addEventListener("change", e => onChange(e.target.value));
};
