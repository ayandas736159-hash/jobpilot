import assert from "node:assert/strict";
import test from "node:test";
import { chooseChecks, chooseOption, parseRange } from "../shared/choices.js";
import { defaultProfile } from "../shared/profile.js";

const profile = defaultProfile();
const internship = [
  "Yes, in cybersecurity, GRC, or IT audit",
  "Yes, in a customer-facing, implementation, or project role",
  "Yes, in another field",
  "No"
];
const scale = ["CGPA out of 10", "CGPA out of 4", "Percentage", "Other"];
const buckets = ["Below 6.0", "6.0 – 6.9", "7.0 – 7.9", "8.0 – 8.9", "9.0 – 10.0"];

test("internship question picks the customer-facing option", () => {
  const choice = chooseOption("Have you completed an internship?", internship, profile);
  assert.equal(choice.label, internship[1]);
  assert.equal(choice.source, "rule");
  assert.notEqual(choice.label, internship[0]);
});

test("CGPA 7.54 maps to a 10-point scale and the 7.0-7.9 bucket", () => {
  const scaleChoice = chooseOption("How does your college report this result?", scale, profile);
  assert.equal(scaleChoice.label, "CGPA out of 10");
  const rangeChoice = chooseOption(
    "If your college reports CGPA on a 10-point scale, where does your current or final score fall?",
    buckets,
    profile
  );
  assert.equal(rangeChoice.label, "7.0 – 7.9");
  assert.equal(rangeChoice.source, "rule");
});

test("checkboxes select only tools named on the resume", () => {
  const checks = chooseChecks("Which of these tools have you used?", ["HubSpot", "Salesforce", "Dripify", "Gong"], profile);
  assert.deepEqual(checks.indices, [0, 2]);
});

test("a start-date question stays blank when notice period is empty", () => {
  const choice = chooseOption("When can you start?", ["Immediately", "In 2 weeks", "In 30 days"], profile);
  assert.equal(choice.source, "none");
  assert.equal(choice.index, -1);
});

test("notice period text selects the matching option", () => {
  const choice = chooseOption("When can you start?", ["Immediately", "In 2 weeks", "In 30 days"], {
    ...profile,
    noticePeriod: "Immediately"
  });
  assert.equal(choice.label, "Immediately");
  assert.equal(choice.source, "rule");
});

test("range parser understands dashes and below", () => {
  assert.deepEqual(parseRange("7.0 – 7.9"), { min: 7, max: 7.9 });
  assert.equal(parseRange("Below 6.0").exclusiveMax, true);
});
