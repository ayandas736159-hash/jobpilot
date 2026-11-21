/** Minimal text PDF so the tailored resume can download without a print dialog. */

function escapePdf(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, (ch) => {
      if (ch === "•" || ch === "·") return "-";
      if (ch === "–" || ch === "—" || ch === "−") return "-";
      if (ch === "’" || ch === "‘") return "'";
      if (ch === "“" || ch === "”") return '"';
      if (ch === "₹") return "Rs ";
      return "";
    });
}

function wrap(text, width) {
  const lines = [];
  String(text || "").split("\n").forEach((raw) => {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      if (`${line} ${words[i]}`.length > width) {
        lines.push(line);
        line = words[i];
      } else {
        line = `${line} ${words[i]}`;
      }
    }
    lines.push(line);
  });
  return lines;
}

export function textToPdfBytes(text) {
  const lines = wrap(text, 92);
  const pages = [];
  for (let i = 0; i < lines.length; i += 52) pages.push(lines.slice(i, i + 52));
  if (!pages.length) pages.push([""]);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  const contentIds = [];
  pages.forEach((pageLines) => {
    let y = 800;
    const commands = ["BT", "/F2 13 Tf", "48 810 Td", "(Resume) Tj", "ET"];
    pageLines.forEach((line, index) => {
      const size = index === 0 ? 12 : 10;
      const fontName = index === 0 ? "F2" : "F1";
      commands.push("BT", `/${fontName} ${size} Tf`, `48 ${y} Td`, `(${escapePdf(line)}) Tj`, "ET");
      y -= size + 3;
    });
    const stream = commands.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(null);
  });
  const pageObjectIds = pages.map((_, index) => {
    const id = add("PAGE");
    pageIds[index] = id;
    return id;
  });
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = add(`<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${kids}] >>`);
  pageObjectIds.forEach((id, index) => {
    objects[id - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  });
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
