import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../shared/markdown.js";

test("markdown escapes raw html and renders basic formatting", () => {
  const html = renderMarkdown("Hello **bold** and `code`\n\n- one\n- two\n\n1. first\n2. second");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<ol>/);
  assert.doesNotMatch(html, /<script/i);
});

test("markdown tables and line breaks work", () => {
  const html = renderMarkdown("| Company | Role |\n| --- | --- |\n| Sprinto | SDR |\n\nLine one<br>Line two");
  assert.match(html, /<table>/);
  assert.match(html, /<td>Sprinto<\/td>/);
  assert.equal(html.match(/<p>/g).length, 2);
});

test("markdown links open in a new tab", () => {
  const html = renderMarkdown("See [Sprinto](https://sprinto.com/jobs)");
  assert.match(html, /target="_blank"/);
  assert.match(html, /href="https:\/\/sprinto.com\/jobs"/);
});