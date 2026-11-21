import assert from "node:assert/strict";
import test from "node:test";
import { bestScan, connectFailureMessage, pickTab } from "../shared/connect.js";

test("pickTab prefers the focused web page over a side-panel or browser tab", () => {
  const tabs = [
    { id: 1, active: true, url: "chrome://extensions" },
    { id: 2, active: true, url: "https://jobs.lever.co/Sprinto/abc/apply" },
    { id: 3, active: false, url: "https://example.com" }
  ];
  assert.equal(pickTab(tabs, 2).id, 2);
  assert.equal(pickTab(tabs, 1).id, 2);
  assert.equal(pickTab([{ id: 9, active: true, url: "" }], 9), null);
});

test("bestScan uses the frame that holds the form and keeps a job description from another frame", () => {
  const best = bestScan([
    { frameId: 0, response: { ok: true, fields: [], jd: { text: "Associate Technical Account Manager" } } },
    { frameId: 7, response: { ok: true, fields: [{ id: "a" }, { id: "b" }], jd: { text: "" } } }
  ]);
  assert.equal(best.frameId, 7);
  assert.equal(best.fields.length, 2);
  assert.match(best.jd.text, /Account Manager/);
});

test("blocked pages get a direct message and a missing script does not ask for a useless refresh", () => {
  assert.match(connectFailureMessage("chrome://newtab"), /browser page/);
  assert.match(connectFailureMessage("https://jobs.lever.co/x/apply", new Error("Could not establish connection. Receiving end does not exist.")), /Reload on JobPilot/);
  assert.match(connectFailureMessage("https://jobs.lever.co/x/apply", new Error("Cannot access contents of the page")), /blocked|Cannot access/);
});
