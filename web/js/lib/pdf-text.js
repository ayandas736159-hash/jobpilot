/**
 * Small PDF text extractor for digitally generated resumes.
 * Handles FlateDecode streams and ToUnicode bfchar/bfrange maps (common in Word/LibreOffice PDFs).
 * Scanned image PDFs return an empty string.
 */

function bytesOf(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return new Uint8Array(input);
  throw new Error("Expected PDF bytes");
}

async function inflate(data) {
  try {
    const { inflateSync } = await import("node:zlib");
    return inflateSync(Buffer.from(data));
  } catch {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
}

function decodeLatin(bytes) {
  let out = "";
  const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < list.length; i += 1) out += String.fromCharCode(list[i]);
  return out;
}

async function loadObjects(bytes) {
  const latin = decodeLatin(bytes);
  const re = /(\d+)\s+\d+\s+obj/g;
  const starts = [];
  let match;
  while ((match = re.exec(latin))) {
    starts.push({ id: Number(match[1]), index: match.index, header: match.index + match[0].length });
  }
  const objects = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : latin.length;
    const text = latin.slice(start.header, end);
    const streamAt = text.indexOf("stream");
    let dict = text;
    let decoded = "";
    if (streamAt !== -1 && /FlateDecode|\/Length/.test(text.slice(0, streamAt + 20))) {
      dict = text.slice(0, streamAt);
      let dataStart = start.header + streamAt + "stream".length;
      if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) dataStart += 2;
      else if (bytes[dataStart] === 10) dataStart += 1;
      const tail = latin.slice(dataStart, end);
      const endStream = tail.indexOf("endstream");
      if (endStream > 0) {
        let body = bytes.subarray(dataStart, dataStart + endStream);
        if (body[body.length - 1] === 10) body = body.subarray(0, body.length - 1);
        if (body[body.length - 1] === 13) body = body.subarray(0, body.length - 1);
        if (/FlateDecode/.test(dict)) {
          try { decoded = decodeLatin(await inflate(body)); } catch { decoded = ""; }
        } else {
          decoded = decodeLatin(body);
        }
      }
    }
    objects.push({ id: start.id, dict, decoded });
  }
  return objects;
}

function parseCMap(text) {
  const map = new Map();
  const charRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
  const blocks = text.split(/beginbfchar|endbfchar|beginbfrange|endbfrange/);
  // bfchar pairs
  const charSection = [...text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)];
  charSection.forEach((section) => {
    let pair;
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    while ((pair = re.exec(section[1]))) {
      map.set(pair[1].toLowerCase(), decodeHexUnicode(pair[2]));
    }
  });
  const rangeSection = [...text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)];
  rangeSection.forEach((section) => {
    const rangeRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let range;
    while ((range = rangeRe.exec(section[1]))) {
      const from = parseInt(range[1], 16);
      const to = parseInt(range[2], 16);
      let code = parseInt(range[3], 16);
      const width = range[1].length;
      for (let value = from; value <= to; value += 1) {
        map.set(value.toString(16).padStart(width, "0"), String.fromCodePoint(code));
        code += 1;
      }
    }
  });
  void charRe;
  void blocks;
  return map;
}

function decodeHexUnicode(hex) {
  let out = "";
  for (let i = 0; i + 3 < hex.length; i += 4) {
    const code = parseInt(hex.slice(i, i + 4), 16);
    if (code === 0xf0b7) out += "•";
    else out += String.fromCodePoint(code);
  }
  if (hex.length % 4 === 2) {
    out += String.fromCharCode(parseInt(hex.slice(-2), 16));
  }
  return out;
}

function decodeHexString(hex, cmap) {
  const clean = hex.replace(/\s+/g, "");
  if (!cmap || cmap.size === 0) {
    let out = "";
    for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    return out;
  }
  const width = [...cmap.keys()].reduce((max, key) => Math.max(max, key.length), 2);
  let out = "";
  for (let i = 0; i < clean.length; i += width) {
    const key = clean.slice(i, i + width).toLowerCase();
    out += cmap.get(key) || "";
  }
  return out;
}

function decodeLiteral(body) {
  return body
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractRuns(content, fontCmaps) {
  const runs = [];
  let font = "F1";
  let x = 0;
  let y = 0;
  let inText = false;
  const tokens = tokenize(content);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.op === "BT") {
      inText = true;
      x = 0;
      y = 0;
    } else if (token.op === "ET") {
      inText = false;
    } else if (token.op === "Tf" && token.name) {
      font = token.name;
    } else if (token.op === "Td" || token.op === "TD") {
      x += token.n1 || 0;
      y += token.n2 || 0;
    } else if (token.op === "Tm") {
      x = token.x || 0;
      y = token.y || 0;
    } else if (inText && (token.op === "Tj" || token.op === "TJ" || token.op === "'")) {
      const cmap = fontCmaps.get(font);
      const text = (token.parts || []).map((part) => (part.hex ? decodeHexString(part.hex, cmap) : decodeLiteral(part.literal || ""))).join("");
      if (text.trim()) runs.push({ x, y, text });
    }
  }
  return runs;
}

function tokenize(content) {
  const tokens = [];
  let i = 0;
  const pending = [];
  function flushOp(op) {
    const numbers = pending.splice(0, pending.length);
    const name = pending.name;
    pending.name = "";
    const parts = pending.parts || [];
    pending.parts = [];
    if (op === "Tj" || op === "'" || op === "TJ") {
      tokens.push({ op, parts });
      return;
    }
    if (op === "Tf") {
      tokens.push({ op, name: name || "", n1: numbers[0] });
      return;
    }
    if (op === "Td" || op === "TD") {
      tokens.push({ op, n1: numbers[numbers.length - 2] || 0, n2: numbers[numbers.length - 1] || 0 });
      return;
    }
    if (op === "Tm") {
      tokens.push({ op, x: numbers[4] || 0, y: numbers[5] || 0 });
      return;
    }
    if (op === "BT" || op === "ET") tokens.push({ op });
  }
  while (i < content.length) {
    const ch = content[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "%") {
      while (i < content.length && content[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "(") {
      let j = i + 1;
      let body = "";
      let depth = 1;
      while (j < content.length && depth > 0) {
        if (content[j] === "\\") { body += content[j] + (content[j + 1] || ""); j += 2; continue; }
        if (content[j] === "(") depth += 1;
        if (content[j] === ")") { depth -= 1; if (depth === 0) break; }
        body += content[j];
        j += 1;
      }
      pending.parts = pending.parts || [];
      pending.parts.push({ literal: body });
      i = j + 1;
      continue;
    }
    if (ch === "<") {
      const j = content.indexOf(">", i + 1);
      const hex = content.slice(i + 1, j === -1 ? i + 1 : j);
      pending.parts = pending.parts || [];
      pending.parts.push({ hex });
      i = (j === -1 ? i : j) + 1;
      continue;
    }
    if (ch === "[") { i += 1; continue; }
    if (ch === "]") { i += 1; continue; }
    if (ch === "/") {
      let j = i + 1;
      while (j < content.length && /[^ \t\r\n\[\]()<>/%]/.test(content[j])) j += 1;
      pending.name = content.slice(i + 1, j);
      i = j;
      continue;
    }
    if (/[0-9+.-]/.test(ch)) {
      let j = i + 1;
      while (j < content.length && /[0-9.eE+-]/.test(content[j])) j += 1;
      pending.push(Number(content.slice(i, j)));
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < content.length && /[A-Za-z*]/.test(content[j])) j += 1;
    const op = content.slice(i, j);
    if (/^(BT|ET|Tj|TJ|Tf|Td|TD|Tm|'|")$/.test(op)) flushOp(op === '"' ? "Tj" : op);
    i = j;
  }
  return tokens;
}

function runsToText(runs) {
  const sorted = runs.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  sorted.forEach((run) => {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(last.y - run.y) > 2.2) lines.push({ y: run.y, parts: [run] });
    else last.parts.push(run);
  });
  return lines.map((line) => line.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ").replace(/[ \t]{2,}/g, " ").trim()).filter(Boolean).join("\n");
}

export async function extractPdfText(input) {
  const bytes = bytesOf(input);
  const objects = await loadObjects(bytes);
  const cmaps = new Map();
  objects.forEach((obj) => {
    if (obj.decoded && obj.decoded.includes("beginbfchar") || (obj.decoded && obj.decoded.includes("beginbfrange"))) {
      cmaps.set(obj.id, parseCMap(obj.decoded));
    }
  });
  const fontToCmap = new Map();
  objects.forEach((obj) => {
    const ref = obj.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (ref && cmaps.has(Number(ref[1]))) fontToCmap.set(obj.id, cmaps.get(Number(ref[1])));
  });
  const aliasToCmap = new Map();
  objects.forEach((obj) => {
    const re = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
    let alias;
    while ((alias = re.exec(obj.dict))) {
      const cmap = fontToCmap.get(Number(alias[2]));
      if (cmap) aliasToCmap.set(alias[1], cmap);
    }
  });
  const chunks = [];
  for (const obj of objects) {
    if (!obj.decoded || !obj.decoded.includes("BT")) continue;
    chunks.push(runsToText(extractRuns(obj.decoded, aliasToCmap)));
  }
  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
