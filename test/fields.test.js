import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { classifyButton, detectAts, scanDocument } from "../shared/fields.js";
import { applyPlan, clickNext, highlightSubmits } from "../shared/fill.js";
import { planFromProposals, proposeField } from "../shared/plan.js";
import { defaultProfile } from "../shared/profile.js";

function dom(html, url) {
  return new JSDOM(html, { url, runScripts: "dangerously" });
}

function load(file, url) {
  return dom(fs.readFileSync(file, "utf8"), url);
}

test("button text separates next from submit", () => {
  assert.equal(classifyButton("Next"), "next");
  assert.equal(classifyButton("Submit application"), "submit");
  assert.equal(classifyButton("Save and continue"), "next");
});

test("google form replica selects radios, checks real tools, and does not submit", () => {
  const { window } = load("web/demo/gform.html", "http://127.0.0.1:4173/demo/gform.html");
  const scan = scanDocument(window.document, window.location.href);
  assert.equal(scan.ats, "google-forms");
  assert.equal(scan.submitButtons.length, 1);
  assert.equal(scan.fields.some((field) => field.kind === "file" || field.purpose === "submit"), false);

  const profile = defaultProfile();
  const proposals = scan.fields.map((field) => ({ field, ...proposeField(field, profile) }));
  const byLabel = (part) => proposals.find((item) => item.field.label.toLowerCase().includes(part));

  const intern = byLabel("completed an internship");
  assert.equal(intern.field.options.find((option) => option.id === intern.optionId).label,
    "Yes, in a customer-facing, implementation, or project role");

  const scale = byLabel("college report");
  assert.equal(scale.field.options.find((option) => option.id === scale.optionId).label, "CGPA out of 10");

  const bucket = byLabel("score fall");
  assert.equal(bucket.field.options.find((option) => option.id === bucket.optionId).label, "7.0 – 7.9");

  const tools = byLabel("tools have you used");
  const checked = tools.optionIds.map((id) => tools.field.options.find((option) => option.id === id).label);
  assert.deepEqual(checked.sort(), ["Dripify", "HubSpot"]);

  const story = proposals.find((item) => item.field.openEnded);
  assert.match(story.field.label, /what changed because of your work/i);
  assert.equal(story.value, "");

  const start = byLabel("when can you start");
  assert.equal(start.include, false);

  const { filled } = applyPlan(window.document, planFromProposals(proposals));
  assert.ok(filled.length >= 4);
  const picked = [...window.document.querySelectorAll("[role='radio'][aria-checked='true']")].map((el) => el.textContent.trim());
  assert.ok(picked.includes("Yes, in a customer-facing, implementation, or project role"));
  assert.ok(picked.includes("CGPA out of 10"));
  assert.ok(picked.includes("7.0 – 7.9"));
  assert.equal(window.document.querySelector("[role='checkbox']").getAttribute("aria-checked"), "true");
  assert.equal(window.document.body.dataset.submitted, undefined);
  highlightSubmits(window.document);
  assert.equal(window.document.querySelector("#sent").hidden, true);
  assert.ok(window.document.querySelector(".jobpilot-submit-guard"));
});

test("greenhouse page fills profile fields, steps forward, and leaves submit alone", () => {
  const { window } = load("web/demo/apply.html", "http://127.0.0.1:4173/demo/apply.html");
  const doc = window.document;
  let scan = scanDocument(doc, window.location.href);
  assert.equal(scan.ats, "greenhouse");
  assert.equal(scan.submitButtons.length, 0);
  assert.equal(scan.nextButtons.length, 1);
  const profile = defaultProfile();
  const proposals = scan.fields.map((field) => ({ field, ...proposeField(field, profile) }));
  const email = proposals.find((item) => item.field.purpose === "email");
  const linkedin = proposals.find((item) => item.field.purpose === "linkedin");
  assert.equal(email.value, profile.email);
  assert.equal(linkedin.value, profile.linkedin);
  applyPlan(doc, planFromProposals(proposals));
  assert.equal(doc.getElementById("first_name").value, "Padmanava");
  assert.equal(doc.getElementById("email").value, profile.email);
  assert.equal(doc.querySelector("[name='urls[LinkedIn]']").value, profile.linkedin);

  const stepped = clickNext(doc);
  assert.equal(stepped.ok, true);
  assert.equal(doc.getElementById("page2").hidden, false);
  scan = scanDocument(doc, window.location.href);
  assert.equal(scan.submitButtons.length, 1);
  assert.ok(scan.fields.some((field) => field.purpose === "whyCompany"));
  assert.ok(scan.fields.some((field) => field.purpose === "coverLetter"));
  const page2 = scan.fields.map((field) => ({ field, ...proposeField(field, profile) }));
  const plan = planFromProposals(page2);
  assert.equal(plan.some((item) => item.id === scan.submitButtons[0].id), false);
  applyPlan(doc, plan);
  highlightSubmits(doc);
  assert.equal(doc.body.dataset.submitted, undefined);
  assert.equal(doc.getElementById("sent").hidden, true);
});

test("other ATS hooks are recognized", () => {
  const workday = dom(`<input data-automation-id="legalNameSection_firstName"><input data-automation-id="email" type="email">`, "https://example.myworkdayjobs.com/job");
  assert.equal(detectAts(workday.window.document, workday.window.location.href), "workday");
  const ashby = dom(`<input name="_systemfield_email" type="email"><input name="_systemfield_name">`, "https://jobs.ashbyhq.com/acme/123");
  const scanned = scanDocument(ashby.window.document, ashby.window.location.href);
  assert.equal(scanned.ats, "ashby");
  assert.equal(scanned.fields.find((field) => field.purpose === "email").purpose, "email");
  const linkedin = dom(`<div class="jobs-easy-apply-modal"><label for="fn">First name</label><input id="fn"></div>`, "https://www.linkedin.com/jobs/view/1");
  assert.equal(detectAts(linkedin.window.document, linkedin.window.location.href), "linkedin");
  const easy = scanDocument(linkedin.window.document, linkedin.window.location.href);
  assert.equal(easy.fields[0].purpose, "firstName");
});
