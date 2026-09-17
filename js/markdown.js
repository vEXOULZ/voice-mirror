// Just enough Markdown to show data/reference.md as a page: headings,
// paragraphs, fenced code, tables, and bold, code and links inline. A library
// would mean fetching code from somewhere other than this site, which the page
// promises it never does.

// Quotes too: a link's target is written inside href="...", and a quote left
// as it was would end the attribute and let the rest of the target become new
// ones.
const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const inline = t => esc(t)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) =>
    /^(https?:|[\w./#-]+$)/.test(href) ? '<a href="' + href + '">' + text + "</a>" : m);

const cells = row => row.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

// Headings come out one level down, `shift`, so the file's title can sit under
// the page's own.
export const renderMarkdown = (src, shift = 1) => {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push("<p>" + inline(para.join(" ")) + "</p>");
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      flush();
      const body = [];
      while (++i < lines.length && !/^```/.test(lines[i])) body.push(lines[i]);
      out.push("<pre><code>" + esc(body.join("\n")) + "</code></pre>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const n = Math.min(6, h[1].length + shift);
      out.push("<h" + n + ">" + inline(h[2]) + "</h" + n + ">");
      continue;
    }
    if (/^\s*\|/.test(line) && lines[i + 1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      i++;
      const rows = [];
      while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) rows.push(cells(lines[++i]));
      out.push('<div class="table-wrap"><table><thead><tr>' +
        head.map(c => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map(c => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table></div>");
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
};
