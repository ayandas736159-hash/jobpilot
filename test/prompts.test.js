import assert from "node:assert/strict";
import test from "node:test";
import { defaultProfile } from "../shared/profile.js";
import {
  assessAnswer,
  buildAnswerMessages,
  buildFactsBlock,
  detectQuestionShape,
  FEW_SHOTS,
  SYSTEM_PROMPT
} from "../shared/prompts.js";

const question = "Tell us about one internship that taught you something useful. What were you responsible for, what did you do, what changed because of your work, and what did you learn? Please give a specific example—an outcome or number helps us understand your contribution.";

test("the internship question is shaped as a story and pulls SoluLab numbers", () => {
  assert.equal(detectQuestionShape(question).id, "story");
  const facts = buildFactsBlock(defaultProfile(), question);
  const primary = facts.split("OTHER ROLES")[0];
  assert.match(primary, /SoluLab/);
  assert.match(primary, /760/);
  assert.match(primary, /1,370|1370/);
  assert.match(primary, /B\.Tech CSE/);
  assert.match(primary, /2026/);
  assert.doesNotMatch(primary, /Foundertruth/);
});

test("answer messages stay short and still carry the rules", () => {
  const messages = buildAnswerMessages({
    question,
    profile: defaultProfile(),
    jd: "Book qualified meetings for a B2B SaaS team.",
    company: "Northwind",
    wordMin: 80,
    wordMax: 150
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Do not invent/);
  assert.match(messages[1].content, /80-150 words/);
  assert.match(messages[1].content, /SoluLab/);
  assert.equal(messages[1].content.includes("gsk_"), false);
  assert.ok(messages[1].content.length < 2500);
  assert.equal(FEW_SHOTS.length, 3);
  assert.match(SYSTEM_PROMPT, /passionate/);
});

test("novel numbers are flagged and known resume numbers are not", () => {
  const corpus = defaultProfile().resumeText;
  const flagged = assessAnswer("I reached 99999 leads and 760 people.", { wordMin: 80, wordMax: 150, corpus });
  assert.deepEqual(flagged.novelNumbers, ["99999"]);
  assert.equal(flagged.tooShort, true);
});
