import assert from "node:assert/strict";
import test from "node:test";
import { analyzeResume, DEFAULT_RESUME, SAMPLE_JD, tailorResume } from "../shared/ats.js";

test("sample SDR job scores real overlap and names missing tools", () => {
  const result = analyzeResume(DEFAULT_RESUME, SAMPLE_JD);
  assert.ok(result.score >= 40 && result.score <= 80, `score ${result.score}`);
  const matched = result.matched.map((item) => item.term);
  const missing = result.missing.map((item) => item.term);
  assert.ok(matched.includes("hubspot"));
  assert.ok(matched.includes("dripify") || matched.includes("sdr"));
  assert.ok(missing.includes("salesforce"));
  assert.ok(missing.includes("cold calling"));
});

test("tailoring reorders real bullets and does not invent them", () => {
  const model = tailorResume(DEFAULT_RESUME, SAMPLE_JD, []);
  const bullets = model.experience.flatMap((entry) => entry.bullets)
    .concat(model.projects.flatMap((entry) => entry.bullets));
  assert.ok(bullets.length > 5);
  bullets.forEach((bullet) => {
    assert.ok(DEFAULT_RESUME.includes(bullet), bullet);
  });
  const skills = model.skills.flatMap((row) => row.items);
  skills.forEach((item) => {
    assert.ok(DEFAULT_RESUME.includes(item), item);
  });
});
