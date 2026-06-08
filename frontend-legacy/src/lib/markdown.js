import { esc } from "./format.js";

// Render minimo de markdown (cabecalho, lista, paragrafo, **bold**).
// Devolve HTML escapado, sem dependencias.
export function renderMarkdown(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  let html = "", list = false;
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) { if (list) { html += "</ul>"; list = false; } continue; }
    if (/^#{1,4}\s/.test(line)) {
      if (list) { html += "</ul>"; list = false; }
      html += `<h3>${inline(line.replace(/^#{1,4}\s/, ""))}</h3>`;
    } else if (/^[-*]\s/.test(line)) {
      if (!list) { html += "<ul>"; list = true; }
      html += `<li>${inline(line.replace(/^[-*]\s/, ""))}</li>`;
    } else {
      if (list) { html += "</ul>"; list = false; }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (list) html += "</ul>";
  return html;
}
