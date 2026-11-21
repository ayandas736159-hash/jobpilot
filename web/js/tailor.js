import { DEFAULT_RESUME, SAMPLE_JD, analyzeResume, renderResumeHtml, resumeToText, tailorResume, parseResume } from "./lib/ats.js";
import { groqAnswer } from "./lib/groq.js";
import { tailorWithGroq } from "./lib/tailor-ai.js";
import { MODELS } from "./lib/models.js";
import { extractPdfText } from "./lib/pdf-text.js";
import { textToPdfBytes } from "./lib/pdf-write.js";
import { defaultProfile, profileCorpus } from "./lib/profile.js";
import { assessAnswer } from "./lib/prompts.js";
import { estimateMessages } from "./lib/tokens.js";
import { buildAnswerMessages } from "./lib/prompts.js";

const $ = (id) => document.getElementById(id);
const savedTheme = localStorage.getItem("jobpilot.theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("jobpilot.theme", next);
});

const profile = { ...defaultProfile(), ...(JSON.parse(localStorage.getItem("jobpilot.profile") || "null") || {}) };
$("resume").value = profile.resumeText || DEFAULT_RESUME;
$("key").value = localStorage.getItem("jobpilot.groqKey") || "";
let lastModel = parseResume($("resume").value);
$("preview").innerHTML = renderResumeHtml(lastModel);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function paint(analysis) {
  $("results").hidden = false;
  $("score").textContent = `${analysis.score}%`;
  $("matched-n").textContent = String(analysis.matched.length);
  $("missing-n").textContent = String(analysis.missing.length);
  $("length").textContent = analysis.pageLabel;
  $("words").textContent = `${analysis.wordCount} words`;
  $("matched").innerHTML = analysis.matched.map((item) => `<span class="chip">${escapeHtml(item.label)}</span>`).join("");
  $("missing").innerHTML = analysis.missing.map((item) => `<span class="chip bad">${escapeHtml(item.label)}</span>`).join("");
  $("ticks").innerHTML = analysis.missing.map((item) => `<label class="tick"><input type="checkbox" value="${escapeHtml(item.term)}"> ${escapeHtml(item.label)}</label>`).join("");
}

function ticks() {
  return [...document.querySelectorAll("#ticks input:checked")].map((box) => box.value);
}

function rememberResume() {
  profile.resumeText = $("resume").value;
  localStorage.setItem("jobpilot.profile", JSON.stringify(profile));
}

$("sample").addEventListener("click", () => { $("jd").value = SAMPLE_JD; });
$("restore").addEventListener("click", () => {
  $("resume").value = DEFAULT_RESUME;
  rememberResume();
  lastModel = parseResume(DEFAULT_RESUME);
  $("preview").innerHTML = renderResumeHtml(lastModel);
});
$("load").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  $("resume").value = await file.text();
  rememberResume();
});
$("pdf-in").addEventListener("click", () => $("pdffile").click());
$("pdffile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  if (!text || text.length < 40) {
    $("status").textContent = "Could not read that PDF. Paste the text instead.";
    return;
  }
  $("resume").value = text;
  rememberResume();
  $("status").textContent = `Read ${text.length} characters from the PDF.`;
});

$("analyze").addEventListener("click", () => {
  if (!$("resume").value.trim() || !$("jd").value.trim()) {
    $("status").textContent = "Add a resume and a job description.";
    return;
  }
  const analysis = analyzeResume($("resume").value, $("jd").value);
  paint(analysis);
  $("status").textContent = `Match ${analysis.score}%. Keyword overlap, not a hiring decision.`;
});

function runTailor() {
  if (!$("resume").value.trim() || !$("jd").value.trim()) {
    $("status").textContent = "Add a job description before tailoring.";
    return;
  }
  const analysis = analyzeResume($("resume").value, $("jd").value);
  paint(analysis);
  lastModel = tailorResume($("resume").value, $("jd").value, ticks());
  $("preview").innerHTML = renderResumeHtml(lastModel);
  $("status").textContent = "Reordered your existing bullets and skills. No new jobs or numbers were added.";
  rememberResume();
}
$("ai-tailor").addEventListener("click", async () => {
  const apiKey = $("key").value.trim();
  localStorage.setItem("jobpilot.groqKey", apiKey);
  if (!apiKey) {
    $("status").textContent = "Paste your Groq key in the answer section below. Tailoring uses the cheaper model.";
    return;
  }
  if (!$("resume").value.trim() || !$("jd").value.trim()) {
    $("status").textContent = "Add a resume and a job description.";
    return;
  }
  profile.resumeText = $("resume").value;
  $("status").textContent = "Tailoring with GPT-OSS 20B…";
  try {
    const result = await tailorWithGroq({ apiKey, profile, jd: $("jd").value });
    lastModel = result.model;
    $("preview").innerHTML = renderResumeHtml(lastModel);
    const changes = (result.changes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const gaps = (result.gaps || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("tailor-notes").innerHTML = `${changes ? `<h2>What changed</h2><ul>${changes}</ul>` : ""}${gaps ? `<h2>Gaps left off the resume</h2><ul>${gaps}</ul>` : ""}`;
    $("status").textContent = "Tailored from your real experience. Nothing new was invented.";
  } catch (error) {
    $("status").textContent = error.message;
  }
});

function download(filename, data, type) {
  const blob = new Blob([data], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
$("download-pdf").addEventListener("click", () => {
  download("Padmanava_Das_Resume.pdf", textToPdfBytes(resumeToText(lastModel)), "application/pdf");
});
$("download-txt").addEventListener("click", () => {
  download("Padmanava_Das_Resume.txt", resumeToText(lastModel), "text/plain");
});
$("print").addEventListener("click", () => window.print());

$("write").addEventListener("click", async () => {
  const apiKey = $("key").value.trim();
  localStorage.setItem("jobpilot.groqKey", apiKey);
  if (!apiKey) {
    $("answer-status").textContent = "Paste your Groq key. It stays in this browser.";
    return;
  }
  profile.resumeText = $("resume").value;
  const limits = { wordMin: 80, wordMax: 150 };
  const messages = buildAnswerMessages({
    question: $("question").value,
    profile,
    jd: $("jd").value,
    ...limits
  });
  const estimate = estimateMessages(messages);
  $("answer-status").textContent = `Writing · about ${estimate} tokens…`;
  try {
    const result = await groqAnswer({
      apiKey,
      model: $("cheap").checked ? MODELS.cheap.id : MODELS.quality.id,
      profile,
      question: $("question").value,
      jd: $("jd").value,
      ...limits
    });
    $("answer").value = result.text;
    const review = assessAnswer(result.text, { ...limits, corpus: `${profileCorpus(profile)}\n${$("jd").value}` });
    const extra = review.novelNumbers.length ? ` Check this number: ${review.novelNumbers.join(", ")}.` : "";
    $("answer-status").textContent = `${review.words} words · ${result.tokens || estimate} tokens.${extra}`;
  } catch (error) {
    $("answer-status").textContent = error.message;
  }
});
