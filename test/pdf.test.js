import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { extractPdfText } from "../shared/pdf-text.js";
import { textToPdfBytes } from "../shared/pdf-write.js";

test("a tiny literal PDF round-trips its text", async () => {
  const body = "BT /F1 12 Tf 72 720 Td (Padmanava Das) Tj ET";
  const pdf = `%PDF-1.4
1 0 obj << /Length ${body.length} >> stream
${body}
endstream endobj
trailer << >>
%%EOF`;
  const text = await extractPdfText(Buffer.from(pdf));
  assert.match(text, /Padmanava Das/);
});

test("text download is a PDF", () => {
  const bytes = textToPdfBytes("PADMANAVA DAS\nSales Development");
  assert.equal(Buffer.from(bytes).toString("latin1").startsWith("%PDF-1.4"), true);
});

test("the uploaded resume extracts contact details when the file is present", async (t) => {
  const path = "/home/ubuntu/.cursor/projects/workspace/uploads/Padmanava_Das_Resume_d95b.pdf";
  if (!fs.existsSync(path)) {
    t.skip();
    return;
  }
  const text = await extractPdfText(fs.readFileSync(path));
  assert.match(text, /PADMANAVA DAS/);
  assert.match(text, /padmanavadas026@gmail.com/);
  assert.match(text, /7\.54/);
  assert.match(text, /SoluLab/);
});
