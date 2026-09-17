// Stamps one version on everything a browser loads, so a visitor never runs a
// new file beside an old one.
//
// GitHub Pages lets a browser keep a file for ten minutes. Right after a push,
// that can mean the new main.js with the old ui.js, and a page that breaks for
// a while for no reason anyone can see. Every URL here carries ?v=<version>,
// and a new version is a new URL, which no cache has yet.
//
// Modules import each other by plain relative path, so the query cannot ride
// along on those. An import map in each page does it instead: it maps every
// module under js/ to its versioned URL, and the browser applies it to every
// import, however deep.
//
//   node tools/stamp.mjs            stamp with the current UTC time
//   node tools/stamp.mjs 2026.1     stamp with a version of your own
//
// Run it before pushing. The tests fail if a page's map misses a module or the
// pages disagree with js/version.js, so forgetting shows up.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PAGES = ["index.html", "reference.html"];

// Every .js under js/, as the page-relative path an import resolves to.
export const listModules = () => {
  const out = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(relative(ROOT, p).split(sep).join("/"));
    }
  };
  walk(join(ROOT, "js"));
  return out.sort();
};

// The stamped block that sits in each page's head.
export const headBlock = version => {
  const map = { imports: {} };
  for (const m of listModules()) map.imports["./" + m] = "./" + m + "?v=" + version;
  return [
    "<!-- version:start. Written by tools/stamp.mjs; edit that, not this. -->",
    '<link rel="stylesheet" href="app.css?v=' + version + '">',
    '<script type="importmap">',
    JSON.stringify(map, null, 2),
    "</script>",
    "<!-- version:end -->"
  ].join("\n");
};

const BLOCK = /<!-- version:start[\s\S]*?<!-- version:end -->/;
const ENTRY = /(<script type="module" src="js\/[\w-]+\.js)(\?v=[^"]*)?"/g;

export const readVersion = () =>
  readFileSync(join(ROOT, "js", "version.js"), "utf8").match(/VERSION = "([^"]+)"/)[1];

export const stamp = version => {
  for (const page of PAGES) {
    const file = join(ROOT, page);
    let html = readFileSync(file, "utf8");
    if (!BLOCK.test(html)) throw new Error(page + " has no version block to stamp");
    html = html.replace(BLOCK, headBlock(version)).replace(ENTRY, '$1?v=' + version + '"');
    writeFileSync(file, html);
  }
  writeFileSync(join(ROOT, "js", "version.js"),
    "// Written by tools/stamp.mjs. The worklets take it as a query, since a\n" +
    "// document's import map does not reach inside an AudioWorklet.\n" +
    'export const VERSION = "' + version + '";\n');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = process.argv[2] || new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  stamp(v);
  console.log("stamped " + v);
}
