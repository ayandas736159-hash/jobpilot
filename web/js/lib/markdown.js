export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function formatInline(line) {
  let text = escapeHtml(line);
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, (_, bold) => `<strong>${escapeHtml(bold)}</strong>`);
  text = text.replace(/\*([^*]+)\*/g, (_, italic) => `<em>${escapeHtml(italic)}</em>`);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) => {
    const safe = escapeHtml(url);
    return `<a href="${safe}" target="_blank" rel="noreferrer noopener">${formatInlinePlain(label)}</a>`;
  });
  return text;
}

function formatInlinePlain(line) {
  let text = escapeHtml(line);
  text = text.replace(/\*\*([^*]+)\*\*/g, (_, bold) => `<strong>${escapeHtml(bold)}</strong>`);
  text = text.replace(/\*([^*]+)\*/g, (_, italic) => `<em>${escapeHtml(italic)}</em>`);
  return text;
}

function isTableRow(line) {
  return /^\s*\|.+\|\s*$/.test(String(line || ""));
}

function isTableSep(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ""));
}

function parseTable(lines, start) {
  if (!isTableRow(lines[start]) || !isTableSep(lines[start + 1])) return null;
  const rows = [];
  let i = start;
  while (i < lines.length && isTableRow(lines[i])) {
    const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    rows.push(cells);
    i += 1;
  }
  if (rows.length < 2) return null;
  const head = rows[0];
  const body = rows.slice(2);
  let html = "<table><thead><tr>";
  head.forEach((cell) => { html += `<th>${formatInline(cell)}</th>`; });
  html += "</tr></thead><tbody>";
  body.forEach((row) => {
    html += "<tr>";
    row.forEach((cell) => { html += `<td>${formatInline(cell)}</td>`; });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return { html, next: i };
}

export function renderMarkdown(source) {
  const normalized = String(source ?? "").replace(/<br\s*\/?>/gi, "\n");
  const lines = normalized.split(/\n/);
  const parts = [];
  let i = 0;
  while (i < lines.length) {
  const line = lines[i];
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const table = parseTable(lines, i);
      if (table) {
        parts.push(table.html);
        i = table.next;
        continue;
      }
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      parts.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${formatInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${formatInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      parts.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    parts.push(`<p>${formatInline(line)}</p>`);
    i += 1;
  }
  return parts.join("");
}