import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { extractBuddyListings } from "../shared/buddy-listings.js";
import { filterPageJobs, mergePageJobs, parseBuddyPageMatches } from "../shared/buddy-page.js";
import { buildBuddySystemPrompt, wantsBuddyPageScan } from "../shared/prompts.js";
import { defaultProfile } from "../shared/profile.js";

test("buddy system prompt includes outbound experience", () => {
  const prompt = buildBuddySystemPrompt(defaultProfile());
  assert.match(prompt, /SoluLab|outbound/i);
  assert.match(prompt, /bullet lists/);
});

test("page scan intent is detected", () => {
  assert.equal(wantsBuddyPageScan("which jobs here should I apply to"), true);
  assert.equal(wantsBuddyPageScan("how do I cold call"), false);
});

test("page jobs merge and filter by role rules", () => {
  const merged = mergePageJobs([
    [{ idx: 0, title: "SDR", href: "https://a.com/1", location: "Worldwide" }],
    [{ idx: 0, title: "SDR", href: "https://a.com/1", location: "Worldwide" }, { idx: 1, title: "US only AE", href: "https://a.com/2", location: "US only" }]
  ]);
  assert.equal(merged.length, 2);
  const kept = filterPageJobs(merged);
  assert.equal(kept.some((job) => /SDR/i.test(job.title)), true);
  assert.equal(kept.some((job) => /US only/i.test(job.location)), false);
});

test("page match json varies scores", () => {
  const parsed = parseBuddyPageMatches('{"matches":[{"idx":0,"score":88,"reason":"Worldwide SDR"},{"idx":1,"score":21,"reason":"US only"}]}', [0, 1]);
  assert.deepEqual(parsed.map((item) => item.score), [88, 21]);
});

test("careers fixture listings extract with href heuristics", () => {
  const dom = new JSDOM(`<main><a href="/careers/sdr-remote">Sales Development Representative</a><a href="/about">About</a></main>`, { url: "https://example.com" });
  const jobs = extractBuddyListings(dom.window.document);
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].title, /Sales Development/);
});