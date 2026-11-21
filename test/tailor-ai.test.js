import assert from "node:assert/strict";
import test from "node:test";
import { defaultProfile } from "../shared/profile.js";
import { assembleTailored, parseJsonObject, resumePack } from "../shared/tailor-ai.js";
import { profileCorpus } from "../shared/profile.js";

test("tailoring keeps real numbers and drops invented ones", () => {
  const profile = defaultProfile();
  const pack = resumePack(profile);
  const source = profileCorpus(profile);
  const solulab = pack.experience.find((entry) => /solulab/i.test(entry.company));
  const original = solulab.bullets[0];
  const llm = {
    summary: "Customer-facing graduate who pitched Foundertruth to 70+ incubators.",
    experience: pack.experience.map((entry) => ({
      bullets: entry.bullets.map((bullet, index) => (entry === solulab && index === 0
        ? "Ran 4 Dripify campaigns and reached about 760 leads for Coverline."
        : bullet))
    })),
    gaps: ["Salesforce", "HubSpot"],
    changes: ["Reworded the SoluLab outreach bullet."]
  };
  llm.experience.find((entry, index) => pack.experience[index] === solulab).bullets[1] = "Closed 40 new logos worth $2M.";
  const result = assembleTailored(pack, llm, source);
  const rewritten = result.model.experience.find((entry) => /solulab/i.test(entry.company));
  assert.match(rewritten.bullets[0], /760/);
  assert.equal(rewritten.bullets[1], solulab.bullets[1]);
  assert.equal(rewritten.company, solulab.company);
  assert.equal(rewritten.dates, solulab.dates);
  assert.deepEqual(result.gaps, ["Salesforce"]);
  assert.ok(result.changes.length >= 1);
  assert.equal(original.includes("760") || original.includes("4"), true);
});

test("JSON fences still parse", () => {
  const parsed = parseJsonObject("```json\n{\"gaps\":[\"Gong\"]}\n```");
  assert.deepEqual(parsed.gaps, ["Gong"]);
});
