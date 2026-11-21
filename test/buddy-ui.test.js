import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { applyBuddyHighlights, extractBuddyListings } from "../shared/buddy-listings.js";
import { closestPageJobs } from "../shared/buddy-page.js";

test("GitLab accordion jobs are read while hidden and India sales stays", () => {
  const html = fs.readFileSync(new URL("../extension/demo/gitlab-jobs.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://about.gitlab.com/jobs/all-jobs/" });
  const jobs = extractBuddyListings(dom.window.document);
  assert.equal(jobs.length, 2);
  const close = closestPageJobs(jobs);
  assert.equal(close.length, 1);
  assert.match(close[0].title, /India/);
  applyBuddyHighlights(dom.window.document, [{ idx: close[0].idx, score: 64, reason: "India sales" }]);
  assert.equal(dom.window.document.querySelector(".results").style.display, "");
  assert.match(dom.window.document.body.innerHTML, /JobPilot 64/);
});

test("Buddy tab stays hidden on other side-panel tabs", () => {
  const html = fs.readFileSync(new URL("../extension/sidepanel.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../extension/buddy.css", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/sidepanel.html", pretendToBeVisual: true });
  const style = dom.window.document.createElement("style");
  style.textContent = css;
  dom.window.document.head.appendChild(style);
  const buddy = dom.window.document.getElementById("buddy");
  assert.equal(buddy.hidden, true);
  assert.equal(dom.window.getComputedStyle(buddy).display, "none");
  assert.equal(dom.window.document.querySelector("#job .buddy-doll"), null);
});

test("Buddy chat does not throw pageContext for a normal message", async () => {
  const html = fs.readFileSync(new URL("../extension/sidepanel.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/sidepanel.html", pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.chrome = {
    storage: {
      local: {
        get(_keys, cb) { cb({ settings: { apiKey: "test" }, profile: { name: "Padmanava Das" }, buddy: {} }); },
        set(_obj, cb) { if (cb) cb(); }
      }
    },
    tabs: { query: async () => [] },
    windows: { getAll: async () => [] }
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "Apply to one role you like." } }], usage: { total_tokens: 12 } })
  });
  dom.window.matchMedia = () => ({ matches: true });
  await import("../extension/buddy.js");
  document.getElementById("buddy").hidden = false;
  document.getElementById("buddy-input").value = "Did you apply to one job today?";
  document.getElementById("buddy-send").click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const log = document.getElementById("buddy-log").textContent;
  assert.equal(/pageContext/.test(log), false);
  assert.match(log, /Apply to one role/);
});