import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { crmStats, csvToEntries, dueFollowUps, entriesToCsv, extractJobPosting, setStage, upsertEntry, wantsCrmSave } from "../shared/crm.js";
import { DEFAULT_BOARDS, purgeRemovedSources } from "../shared/jobs.js";

test("JSON-LD job posting is read before a model", () => {
  const dom = new JSDOM(`<script type="application/ld+json">{"@type":"JobPosting","title":"Associate TAM","hiringOrganization":{"name":"Sprinto"},"jobLocation":{"address":{"addressCountry":"India"}},"url":"https://jobs.lever.co/Sprinto/1"}</script>`, { url: "https://jobs.lever.co/Sprinto/1" });
  const posting = extractJobPosting(dom.window.document, "https://jobs.lever.co/Sprinto/1");
  assert.equal(posting.company, "Sprinto");
  assert.equal(posting.title, "Associate TAM");
  assert.equal(posting.needsModel, false);
  assert.equal(posting.source, "Lever");
});

test("CRM dedupes by URL and logs applied plus a follow-up", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  const first = upsertEntry([], { url: "https://jobs.example.com/a", title: "SDR", company: "Deel", stage: "Saved" }, now);
  const second = upsertEntry(first, { url: "https://jobs.example.com/a#apply", title: "SDR", company: "Deel", stage: "Applied" }, now);
  assert.equal(second.length, 1);
  assert.equal(second[0].stage, "Applied");
  assert.equal(second[0].followUpOn, now + 5 * 86400000);
  const followed = setStage(second[0], "Followed up", now);
  assert.equal(followed.stage, "Followed up");
  assert.equal(dueFollowUps([followed], now + 6 * 86400000).length, 1);
});

test("CSV round trip and weekly stats", () => {
  const now = Date.now();
  const entries = upsertEntry([], { url: "https://example.com/1", title: "BDR", company: "BrowserStack", stage: "Interview", appliedAt: now }, now);
  const parsed = csvToEntries(entriesToCsv(entries));
  assert.equal(parsed[0].company, "BrowserStack");
  assert.equal(parsed[0].stage, "Interview");
  const stats = crmStats(entries, now);
  assert.equal(stats.appliedWeek, 1);
  assert.equal(stats.responseRate, 100);
});

test("save this job is a CRM command", () => {
  assert.equal(wantsCrmSave("save this job"), true);
  assert.equal(wantsCrmSave("save the job please"), true);
});

test("paid job boards are removed and company boards are the default", () => {
  const next = purgeRemovedSources({
    jobs: [
      { id: "remoteok:1", source: "RemoteOK", url: "https://remoteok.com/1" },
      { id: "remotive:2", source: "Remotive", url: "https://remotive.com/2" }
    ],
    scores: { "remoteok:1": { score: 10 } }
  });
  assert.equal(next.jobs.length, 1);
  assert.equal(next.scores["remoteok:1"], undefined);
  assert.ok(DEFAULT_BOARDS.length >= 30);
  assert.ok(DEFAULT_BOARDS.some((board) => board.slug === "Sprinto" && board.kind === "lever"));
});