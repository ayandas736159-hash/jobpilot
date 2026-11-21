import assert from "node:assert/strict";
import test from "node:test";
import { defaultProfile } from "../shared/profile.js";
import {
  applyScoreCache,
  jobsNeedingScore,
  jobsToNotify,
  matchJob,
  mergeJobs,
  normalizeGreenhouse,
  normalizeLever,
  normalizeRemotive,
  parseBoards,
  parseFitScores,
  profileBrief,
  sortByFit
} from "../shared/jobs.js";

test("target titles match and senior or country-locked roles do not", () => {
  assert.equal(matchJob({ title: "Sales Development Representative", location: "Remote, Worldwide", remote: true }), true);
  assert.equal(matchJob({ title: "Associate Technical Account Manager", location: "Remote - India", remote: true }), true);
  assert.equal(matchJob({ title: "Customer Success Associate", location: "APAC, remote", remote: true }), true);
  assert.equal(matchJob({ title: "Senior Customer Success Manager", location: "Remote", remote: true }), false);
  assert.equal(matchJob({ title: "Sales Development Representative", location: "United States", remote: true }), false);
  assert.equal(matchJob({ title: "SDR", location: "Remote, US Only", remote: true }), false);
  assert.equal(matchJob({ title: "BDR", location: "Remote UK", remote: true }), false);
  assert.equal(matchJob({ title: "Sales Manager", location: "Remote", remote: true }), false);
  assert.equal(matchJob({ title: "Account Executive", location: "Remote", remote: true }), false);
});

test("new jobs are deduped and sorted newest first", () => {
  const first = mergeJobs([], [{ id: "a", url: "https://example.com/a", title: "SDR", postedAt: 10 }]);
  const second = mergeJobs(first.jobs, [
    { id: "a", url: "https://example.com/a", title: "SDR", postedAt: 10 },
    { id: "b", url: "https://example.com/b", title: "BDR", postedAt: 20 }
  ]);
  assert.equal(second.fresh.length, 1);
  assert.equal(second.jobs[0].id, "b");
  assert.equal(second.jobs.filter((job) => job.id === "a").length, 1);
});

test("smart match scores each new job once and notifies only high fits", () => {
  const jobs = [
    { id: "a", postedAt: 1 },
    { id: "b", postedAt: 3 },
    { id: "c", postedAt: 2 }
  ];
  const cache = { a: { score: 80, reason: "SDR outreach" } };
  assert.deepEqual(jobsNeedingScore(jobs, cache, 1).map((job) => job.id), ["b"]);
  const scored = sortByFit(applyScoreCache(jobs, { ...cache, b: { score: 40, reason: "Weak" } }));
  assert.deepEqual(scored.map((job) => job.id), ["a", "b", "c"]);
  const parsed = parseFitScores("```json\n{\"jobs\":[{\"id\":\"b\",\"score\":82,\"reason\":\"Outbound overlaps this SDR role\"},{\"id\":\"c\",\"score\":18,\"reason\":\"US only\"},{\"id\":\"nope\",\"score\":10,\"reason\":\"x\"},{\"id\":\"a\"}]}\n```", ["a", "b", "c"]);
  assert.deepEqual(parsed.map((item) => item.score), [82, 18]);
  assert.equal(parsed.some((item) => item.score === 25), false);
  assert.equal(jobsToNotify([{ id: "b", fit: 70 }, { id: "c", fit: 40 }], { smartOn: true, fallback: false, threshold: 60 }).length, 1);
  assert.equal(jobsToNotify([{ id: "c", fit: 40 }], { smartOn: true, fallback: true, threshold: 60 }).length, 1);
});

test("the scorer brief includes real outbound experience from the resume", () => {
  const brief = profileBrief({ resumeText: defaultProfile().resumeText, stories: [] });
  assert.match(brief, /SoluLab/);
  assert.match(brief, /760/);
  assert.match(brief, /strong fit/);
  const fromStories = profileBrief(defaultProfile());
  assert.match(fromStories, /Dripify|Foundertruth/);
});

test("public board payloads become jobs", () => {
  const remotive = normalizeRemotive({
    jobs: [{ id: 5, url: "https://remotive.com/job/5", title: "SDR", company_name: "Acme", candidate_required_location: "Worldwide", publication_date: "2026-11-01T00:00:00", description: "<p>Remote SDR</p>" }]
  });
  assert.equal(remotive[0].company, "Acme");
  assert.equal(remotive[0].description, "Remote SDR");
  const greenhouse = normalizeGreenhouse({ jobs: [{ id: 9, title: "BDR", absolute_url: "https://boards.greenhouse.io/acme/jobs/9", location: { name: "Remote" } }] }, "acme");
  assert.equal(greenhouse[0].source, "Greenhouse");
  const lever = normalizeLever([{ id: "x", text: "Associate TAM", hostedUrl: "https://jobs.lever.co/acme/x", categories: { location: "Remote - India" }, createdAt: 1700000000000 }], "acme");
  assert.equal(lever[0].title, "Associate TAM");
  assert.deepEqual(parseBoards("greenhouse:airbnb\nlever:spotify\nnope"), [
    { kind: "greenhouse", slug: "airbnb" },
    { kind: "lever", slug: "spotify" }
  ]);
});
