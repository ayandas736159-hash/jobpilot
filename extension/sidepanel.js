import { SAMPLE_JD, analyzeResume, renderResumeHtml, resumeToText } from "./lib/ats.js";
import { bestScan, connectFailureMessage, isWebPage, pickTab } from "./lib/connect.js";
import { groqAnswer, groqChat, groqCheckKey, groqChoice } from "./lib/groq.js";
import { EMAIL_TIP, STRATEGY, draftOutreach, gmailUrl, mailtoUrl, outreachKey } from "./lib/outreach.js";
import { CRM_KEY, crmMessages, crmStats, csvToEntries, entriesToCsv, parseCrmExtract, setStage, upsertEntry } from "./lib/crm.js";
import { MODELS } from "./lib/models.js";
import { extractPdfText } from "./lib/pdf-text.js";
import { textToPdfBytes } from "./lib/pdf-write.js";
import { planFromProposals, proposeField } from "./lib/plan.js";
import { defaultProfile, profileCorpus } from "./lib/profile.js";
import { assessAnswer, buildAnswerMessages } from "./lib/prompts.js";
import { tailorWithGroq } from "./lib/tailor-ai.js";
import { estimateMessages } from "./lib/tokens.js";

const $ = (id) => document.getElementById(id);
const state = {
  profile: defaultProfile(),
  settings: { apiKey: "", saveCredits: false, customModel: "", wordMin: 80, wordMax: 150, theme: "" },
  proposals: [],
  scan: null,
  modelCache: null,
  tokens: 0,
  pageUrl: "",
  frameId: null
};

function storageGet(area, keys) {
  return new Promise((resolve) => chrome.storage[area].get(keys, resolve));
}
function storageSet(area, value) {
  return new Promise((resolve) => chrome.storage[area].set(value, resolve));
}

function activeModel() {
  const custom = state.settings.customModel.trim();
  if (custom) return custom;
  return state.settings.saveCredits ? MODELS.cheap.id : MODELS.quality.id;
}

function wordLimits() {
  const wordMin = Math.max(40, Number(state.settings.wordMin) || 80);
  const wordMax = Math.max(wordMin, Number(state.settings.wordMax) || 150);
  return { wordMin, wordMax };
}

function setStatus(id, text) {
  $(id).textContent = text || "";
}

async function loadAll() {
  const local = await storageGet("local", ["profile", "settings"]);
  if (local.profile) state.profile = { ...defaultProfile(), ...local.profile, stories: local.profile.stories || defaultProfile().stories };
  if (local.settings) state.settings = { ...state.settings, ...local.settings };
  applyTheme(state.settings.theme);
  fillProfileForm();
  fillSettingsForm();
}

function applyTheme(theme) {
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
  else document.documentElement.removeAttribute("data-theme");
}

function readProfileForm() {
  const stories = [...document.querySelectorAll(".story")].map((node, index) => ({
    id: node.dataset.id || `story-${index}`,
    role: node.querySelector(".story-role").value.trim(),
    facts: node.querySelector(".story-facts").value.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  })).filter((story) => story.role || story.facts.length);
  state.profile = {
    name: $("p-name").value.trim(),
    email: $("p-email").value.trim(),
    phone: $("p-phone").value.trim(),
    linkedin: $("p-linkedin").value.trim(),
    portfolio: $("p-portfolio").value.trim(),
    location: $("p-location").value.trim(),
    workAuthorization: $("p-auth").value.trim(),
    noticePeriod: $("p-notice").value.trim(),
    expectedSalary: $("p-salary").value.trim(),
    links: $("p-links").value.trim(),
    resumeText: $("p-resume").value,
    stories
  };
}

function fillProfileForm() {
  const profile = state.profile;
  $("p-name").value = profile.name || "";
  $("p-email").value = profile.email || "";
  $("p-phone").value = profile.phone || "";
  $("p-linkedin").value = profile.linkedin || "";
  $("p-portfolio").value = profile.portfolio || "";
  $("p-location").value = profile.location || "";
  $("p-auth").value = profile.workAuthorization || "";
  $("p-notice").value = profile.noticePeriod || "";
  $("p-salary").value = profile.expectedSalary || "";
  $("p-links").value = profile.links || "";
  $("p-resume").value = profile.resumeText || "";
  renderStories();
}

function renderStories() {
  const root = $("stories");
  root.innerHTML = "";
  (state.profile.stories || []).forEach((story) => root.appendChild(storyNode(story)));
}

function storyNode(story) {
  const wrap = document.createElement("div");
  wrap.className = "story";
  wrap.dataset.id = story.id || "";
  const facts = Array.isArray(story.facts) ? story.facts.join("\n") : (story.facts || "");
  wrap.innerHTML = `<label>Role</label><input class="story-role" value="">
    <label>Facts, one per line</label><textarea class="story-facts"></textarea>
    <button type="button" class="remove">Remove</button>`;
  wrap.querySelector(".story-role").value = story.role || "";
  wrap.querySelector(".story-facts").value = facts;
  wrap.querySelector(".remove").addEventListener("click", () => wrap.remove());
  return wrap;
}

function fillSettingsForm() {
  $("s-key").value = state.settings.apiKey || "";
  $("s-save").checked = Boolean(state.settings.saveCredits);
  $("s-custom").value = state.settings.customModel || "";
  $("s-min").value = state.settings.wordMin || 80;
  $("s-max").value = state.settings.wordMax || 150;
  $("model-note").textContent = state.settings.saveCredits
    ? `${MODELS.cheap.label}: ${MODELS.cheap.detail}`
    : `${MODELS.quality.label}: ${MODELS.quality.detail}`;
}

function readSettingsForm() {
  state.settings = {
    ...state.settings,
    apiKey: $("s-key").value.trim(),
    saveCredits: $("s-save").checked,
    customModel: $("s-custom").value.trim(),
    wordMin: Number($("s-min").value) || 80,
    wordMax: Number($("s-max").value) || 150
  };
  fillSettingsForm();
}

async function activeTab() {
  const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const tabs = windows.flatMap((win) => win.tabs || []);
  const picked = pickTab(tabs, focused?.id);
  if (picked?.id) return picked;
  if (focused?.id && isWebPage(focused.url || "")) return focused;
  if (focused?.url && !isWebPage(focused.url)) {
    throw new Error(connectFailureMessage(focused.url));
  }
  throw new Error("No application tab is active. Open the job form, then scan again.");
}

async function frameIds(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => location.href
  });
  return results.map((item) => item.frameId);
}

async function askFrames(tabId, type, extra) {
  let ids = [];
  try {
    ids = await frameIds(tabId);
  } catch {
    ids = [0];
  }
  const ordered = [];
  if (state.frameId != null && ids.includes(state.frameId)) ordered.push(state.frameId);
  ids.forEach((id) => {
    if (!ordered.includes(id)) ordered.push(id);
  });
  const collected = [];
  for (const frameId of ordered) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type, ...extra }, { frameId });
      if (response?.ok) collected.push({ frameId, response });
    } catch {
      /* This frame has no JobPilot listener yet. */
    }
  }
  if (type === "SCAN" || type === "EXTRACT_JD") return bestScan(collected);
  if (!collected.length) return null;
  state.frameId = collected[0].frameId;
  return collected[0].response;
}

async function injectFrames(tabId) {
  const ids = await frameIds(tabId);
  const failures = [];
  for (const frameId of ids) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["inject.js"]
      });
      let ready = false;
      let error = "";
      for (let attempt = 0; attempt < 25 && !ready && !error; attempt += 1) {
        const [probe] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          func: () => ({ ready: !!globalThis.__jobpilotReady, error: globalThis.__jobpilotError || "" })
        });
        ready = !!probe?.result?.ready;
        error = probe?.result?.error || "";
        if (!ready && !error) await new Promise((resolve) => setTimeout(resolve, 40));
      }
      if (error) throw new Error(error);
      if (!ready) throw new Error("The page script did not start.");
    } catch (error) {
      failures.push(error);
    }
  }
  if (!ids.length || failures.length === ids.length) throw failures[0] || new Error("Could not inject JobPilot.");
}

async function send(type, extra = {}) {
  const tab = await activeTab();
  if (tab.url && !isWebPage(tab.url)) throw new Error(connectFailureMessage(tab.url));
  let response = await askFrames(tab.id, type, extra);
  if (!response) {
    try {
      await injectFrames(tab.id);
    } catch (error) {
      throw new Error(connectFailureMessage(tab.url, error));
    }
    response = await askFrames(tab.id, type, extra);
  }
  if (!response) throw new Error(connectFailureMessage(tab.url, "Receiving end does not exist."));
  if (response.frameId != null) state.frameId = response.frameId;
  return response;
}

function hash(value) {
  let h = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) h = Math.imul(31, h) + text.charCodeAt(i) | 0;
  return String(h);
}

function paintScore(analysis) {
  $("score-card").hidden = false;
  $("score").textContent = `${analysis.score}%`;
  $("ring").style.setProperty("--p", String(analysis.score));
  $("score-meta").textContent = `${analysis.matched.length} matched · ${analysis.missing.length} missing · ${analysis.wordCount} words · ${analysis.pageLabel}`;
  $("matched").innerHTML = analysis.matched.map((item) => `<span class="chip">${escapeHtml(item.label)}</span>`).join("")
    || `<span class="muted">No overlapping keywords.</span>`;
  $("missing").innerHTML = analysis.missing.map((item) => `<label class="tick"><input type="checkbox" value="${escapeHtml(item.term)}"> <span>${escapeHtml(item.label)} — only if this is already true</span></label>`).join("")
    || `<span class="muted">Nothing important is missing.</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function tickedTerms() {
  return [...document.querySelectorAll("#missing input:checked")].map((box) => box.value);
}

function download(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderProposals() {
  const root = $("proposals");
  root.innerHTML = "";
  state.proposals.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "proposal";
    const field = item.field;
    const estimate = field.openEnded ? estimateMessages(buildAnswerMessages({
      question: field.label,
      profile: state.profile,
      jd: $("jd").value,
      wordMin: wordLimits().wordMin,
      wordMax: wordLimits().wordMax
    })) : 0;
    card.innerHTML = `<header><strong>${escapeHtml(field.label || field.purpose || "Field")}</strong><span class="kind">${escapeHtml(field.kind)}</span></header>
      <p class="muted">${escapeHtml(item.reason || "")}${estimate ? ` · about ${estimate} tokens to write` : ""}</p>`;
    if (field.kind === "single") {
      const select = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Leave blank";
      select.appendChild(blank);
      field.options.forEach((option) => {
        const node = document.createElement("option");
        node.value = option.id;
        node.textContent = option.label;
        if (option.id === item.optionId) node.selected = true;
        select.appendChild(node);
      });
      select.addEventListener("change", () => {
        item.optionId = select.value;
        item.include = Boolean(select.value);
      });
      card.appendChild(select);
    } else if (field.kind === "multi") {
      field.options.forEach((option) => {
        const label = document.createElement("label");
        label.className = "tick";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = item.optionIds.includes(option.id);
        box.addEventListener("change", () => {
          item.optionIds = field.options.filter((candidate) => {
            const input = card.querySelector(`input[data-option="${candidate.id}"]`);
            return input?.checked;
          }).map((candidate) => candidate.id);
          item.include = item.optionIds.length > 0;
        });
        box.dataset.option = option.id;
        label.append(box, document.createTextNode(` ${option.label}`));
        card.appendChild(label);
      });
    } else if (field.kind !== "file") {
      const area = document.createElement(field.openEnded ? "textarea" : "input");
      area.value = item.value || "";
      area.addEventListener("input", () => {
        item.value = area.value;
        item.include = Boolean(area.value.trim()) || field.openEnded;
      });
      card.appendChild(area);
    }
    if (item.review) {
      const note = document.createElement("p");
      note.className = item.review.novelNumbers.length || item.review.tooShort || item.review.tooLong ? "warn" : "muted";
      const bits = [`${item.review.words} words`];
      if (item.review.tooShort || item.review.tooLong) bits.push("outside the word range — edit or write again");
      if (item.review.novelNumbers.length) bits.push(`number not in your profile: ${item.review.novelNumbers.join(", ")}`);
      note.textContent = bits.join(" · ");
      card.appendChild(note);
    }
    root.appendChild(card);
    void index;
  });
  $("tokens").textContent = `Tokens this session: ${state.tokens}`;
}

async function cachedAnswer(key) {
  const stored = await storageGet("local", [key]);
  return stored[key] || "";
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("on", tab === button));
    document.querySelectorAll(".view").forEach((view) => {
      view.hidden = view.id !== button.dataset.tab;
    });
  });
});

$("theme").addEventListener("click", async () => {
  const current = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  state.settings.theme = current === "dark" ? "light" : "dark";
  applyTheme(state.settings.theme);
  await storageSet("local", { settings: state.settings });
});

$("sample-jd").addEventListener("click", () => {
  $("jd").value = SAMPLE_JD;
  setStatus("job-status", "Sample SDR description loaded.");
});

$("extract").addEventListener("click", async () => {
  setStatus("job-status", "Reading the open page…");
  try {
    const tab = await activeTab();
    const key = `jd:${(tab.url || "").split("#")[0]}`;
    const cached = await storageGet("session", [key]);
    if (cached[key]?.text && !$("jd").value.trim()) {
      $("jd").value = cached[key].text;
      setStatus("job-status", "Using the description already saved for this tab.");
      return;
    }
    const response = await send("EXTRACT_JD");
    if (!response.jd.text) {
      setStatus("job-status", "No job description found. Paste it above.");
      return;
    }
    $("jd").value = response.jd.text;
    state.pageUrl = response.url || tab.url || "";
    await storageSet("session", { [key]: response.jd });
    setStatus("job-status", `Saved the description from this page (${response.jd.text.length} characters).`);
  } catch (error) {
    setStatus("job-status", error.message);
  }
});

$("analyze").addEventListener("click", async () => {
  await ready;
  const resume = state.profile.resumeText || $("p-resume").value;
  const jd = $("jd").value.trim();
  if (!resume || !jd) {
    setStatus("job-status", "Add a resume in Profile and a job description here.");
    return;
  }
  const analysis = analyzeResume(resume, jd);
  state.analysis = analysis;
  paintScore(analysis);
  setStatus("job-status", `Match ${analysis.score}%. This is keyword overlap, not a hiring decision.`);
});

function showTailor(result) {
  state.modelCache = result.model;
  state.tailorNotes = result;
  $("preview").innerHTML = renderResumeHtml(result.model);
  $("preview-wrap").hidden = false;
  const changes = (result.changes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const gaps = (result.gaps || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("tailor-notes").innerHTML = `${changes ? `<h3>What changed</h3><ul>${changes}</ul>` : ""}
    ${gaps ? `<h3>Gaps left off the resume</h3><ul>${gaps}</ul>` : "<p class=\"muted\">No extra gaps were listed.</p>"}`;
}

$("tailor").addEventListener("click", async () => {
  await ready;
  readProfileForm();
  const resume = state.profile.resumeText;
  const jd = $("jd").value.trim();
  if (!resume || !jd) {
    setStatus("job-status", "Add a resume and a job description first.");
    return;
  }
  if (!state.settings.apiKey) {
    setStatus("job-status", "Add your Groq key in Settings. Tailoring uses the cheaper model and your own key.");
    return;
  }
  const cacheKey = `tailor:${hash(`${jd.slice(0, 1500)}|${resume.slice(0, 300)}`)}`;
  const cached = await storageGet("local", [cacheKey]);
  if (cached[cacheKey]?.model) {
    showTailor(cached[cacheKey]);
    setStatus("job-status", "Loaded the tailored resume saved for this job description.");
    return;
  }
  setStatus("job-status", "Tailoring with GPT-OSS 20B. One call, using only facts from your profile…");
  try {
    const result = await tailorWithGroq({ apiKey: state.settings.apiKey, profile: state.profile, jd });
    showTailor(result);
    state.tokens += result.tokens || 0;
    $("tokens").textContent = `Tokens this session: ${state.tokens}`;
    await storageSet("local", { [cacheKey]: { model: result.model, changes: result.changes, gaps: result.gaps } });
    setStatus("job-status", "Tailored from your real experience. New employers, numbers, and tools were not added.");
  } catch (error) {
    setStatus("job-status", error.message);
  }
});

$("copy").addEventListener("click", async () => {
  if (!state.modelCache) return;
  await navigator.clipboard.writeText(resumeToText(state.modelCache));
  setStatus("job-status", "Copied the resume text.");
});
$("pdf").addEventListener("click", () => {
  if (!state.modelCache) return;
  download("Padmanava_Das_Resume.pdf", textToPdfBytes(resumeToText(state.modelCache)), "application/pdf");
});
$("txt").addEventListener("click", () => {
  if (!state.modelCache) return;
  download("Padmanava_Das_Resume.txt", resumeToText(state.modelCache), "text/plain");
});

$("scan").addEventListener("click", async () => {
  await ready;
  setStatus("fill-status", "Scanning the form…");
  try {
    readProfileForm();
    const response = await send("SCAN");
    state.scan = response;
    if (response.jd?.text && !$("jd").value.trim()) $("jd").value = response.jd.text;
    state.proposals = response.fields.map((field) => ({ field, ...proposeField(field, state.profile) }));
    renderProposals();
    const guard = await send("HIGHLIGHT");
    $("guard").hidden = guard.marked.length === 0;
    const uncertain = state.proposals.filter((item) => item.choice?.source === "needs-model").length;
    setStatus("fill-status", `${response.ats} form · ${response.fields.length} fields · ${uncertain} choice${uncertain === 1 ? "" : "s"} may need a short model call.`);
    if (uncertain) await resolveUncertain();
  } catch (error) {
    setStatus("fill-status", error.message);
  }
});

async function resolveUncertain() {
  const pending = state.proposals.filter((item) => item.field.kind === "single" && item.choice?.source === "needs-model");
  if (!pending.length) return;
  if (!state.settings.apiKey) {
    setStatus("fill-status", "A choice is ambiguous. Add a Groq key in Settings, or pick the option yourself.");
    return;
  }
  for (const item of pending) {
    const labels = item.field.options.map((option) => option.label);
    const estimate = estimateMessages([{ content: item.field.label }, { content: labels.join(" ") }]);
    setStatus("fill-status", `Choosing “${item.field.label.slice(0, 60)}” · about ${estimate} tokens…`);
    const result = await groqChoice({
      apiKey: state.settings.apiKey,
      question: item.field.label,
      options: labels,
      profile: state.profile
    });
    state.tokens += result.tokens || estimate;
    if (result.index >= 0) {
      item.optionId = item.field.options[result.index].id;
      item.include = true;
      item.reason = "Chosen by the cheaper model from your profile facts.";
      item.choice = { ...item.choice, source: "model" };
    } else {
      item.reason = "The cheaper model would not pick an option. Leave it blank or choose one.";
    }
  }
  renderProposals();
}

$("write").addEventListener("click", async () => {
  await ready;
  readProfileForm();
  if (!state.settings.apiKey) {
    setStatus("fill-status", "Add your Groq key in Settings first.");
    return;
  }
  const open = state.proposals.filter((item) => item.field.openEnded);
  if (!open.length) {
    setStatus("fill-status", "Scan a form with a written question first.");
    return;
  }
  const limits = wordLimits();
  const jd = $("jd").value.trim();
  for (const item of open) {
    const cacheKey = `ans:${hash([item.field.label, jd, activeModel(), limits.wordMin, limits.wordMax, profileCorpus(state.profile)].join("|"))}`;
    const saved = await cachedAnswer(cacheKey);
    if (saved && saved.trim() && !item.value) {
      item.value = saved;
      item.review = assessAnswer(saved, { ...limits, corpus: `${profileCorpus(state.profile)}\n${jd}` });
      continue;
    }
    const messages = buildAnswerMessages({
      question: item.field.label,
      profile: state.profile,
      jd,
      company: state.scan?.company || "",
      ...limits
    });
    const estimate = estimateMessages(messages);
    setStatus("fill-status", `Writing an answer · about ${estimate} tokens…`);
    try {
      const result = await groqAnswer({
        apiKey: state.settings.apiKey,
        model: activeModel(),
        profile: state.profile,
        question: item.field.label,
        jd,
        company: state.scan?.company || "",
        ...limits
      });
      if (!result.text || !result.text.trim()) {
        throw new Error("Groq returned an empty answer. Press Write answers to retry.");
      }
      item.value = result.text.trim();
      item.include = true;
      state.tokens += result.tokens || estimate;
      item.review = assessAnswer(item.value, { ...limits, corpus: `${profileCorpus(state.profile)}\n${jd}` });
      await storageSet("local", { [cacheKey]: item.value });
    } catch (error) {
      item.review = null;
      setStatus("fill-status", error.message);
      renderProposals();
      return;
    }
  }
  const missing = open.filter((item) => !String(item.value || "").trim());
  renderProposals();
  if (missing.length) {
    setStatus("fill-status", "Groq returned no text for an answer. Press Write answers to retry.");
    return;
  }
  setStatus("fill-status", "Answers are in the panel. Edit them, then fill the page. Nothing is submitted.");
});

$("fill-page").addEventListener("click", async () => {
  try {
    const plan = planFromProposals(state.proposals);
    const result = await send("FILL", { plan });
    $("guard").hidden = false;
    await rememberApplication("Applied");
    setStatus("fill-status", `Filled ${result.filled.length} field${result.filled.length === 1 ? "" : "s"}. Saved in CRM as Applied. Submit stays highlighted for you.`);
  } catch (error) {
    setStatus("fill-status", error.message);
  }
});

$("next-page").addEventListener("click", async () => {
  try {
    const result = await send("NEXT");
    if (!result.ok && result.reason) {
      setStatus("fill-status", result.reason);
      return;
    }
    setStatus("fill-status", `Opened “${result.label || "next"}”. Scanning the new page…`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    $("scan").click();
  } catch (error) {
    setStatus("fill-status", error.message);
  }
});

$("save-profile").addEventListener("click", async () => {
  readProfileForm();
  await storageSet("local", { profile: state.profile });
  setStatus("profile-status", "Profile saved on this computer.");
});

$("add-story").addEventListener("click", () => {
  $("stories").appendChild(storyNode({ id: `story-${Date.now()}`, role: "", facts: [] }));
});

$("restore").addEventListener("click", async () => {
  state.profile = defaultProfile();
  fillProfileForm();
  await storageSet("local", { profile: state.profile });
  setStatus("profile-status", "Sample profile restored.");
});

$("load-txt").addEventListener("click", () => $("file-txt").click());
$("load-pdf").addEventListener("click", () => $("file-pdf").click());
$("file-txt").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  $("p-resume").value = await file.text();
  setStatus("profile-status", `Loaded ${file.name}. Save the profile to keep it.`);
});
$("file-pdf").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  if (!text || text.length < 40) {
    setStatus("profile-status", "Could not read that PDF. Paste the text instead.");
    return;
  }
  $("p-resume").value = text;
  setStatus("profile-status", `Read ${text.length} characters from ${file.name}.`);
});

$("save-settings").addEventListener("click", async () => {
  readSettingsForm();
  await storageSet("local", { settings: state.settings });
  setStatus("settings-status", "Settings saved locally.");
});

$("s-save").addEventListener("change", () => {
  state.settings.saveCredits = $("s-save").checked;
  fillSettingsForm();
});

$("test-key").addEventListener("click", async () => {
  readSettingsForm();
  if (!state.settings.apiKey) {
    setStatus("settings-status", "Paste a key first.");
    return;
  }
  setStatus("settings-status", "Checking the key with a model list, not a generation…");
  try {
    await groqCheckKey(state.settings.apiKey);
    await storageSet("local", { settings: state.settings });
    setStatus("settings-status", "Key accepted. No answer was generated.");
  } catch (error) {
    setStatus("settings-status", error.message);
  }
});

function escapeOutreach(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderOutreach(draft, log) {
  const box = $("outreach");
  box.hidden = false;
  const toLine = draft.to ? `To: ${escapeOutreach(draft.to)}` : EMAIL_TIP;
  box.innerHTML = `<div class="card"><p class="muted">${STRATEGY}</p><p>${toLine}</p><p><strong>${escapeOutreach(draft.subject)}</strong></p><p>${escapeOutreach(draft.body)}</p><p><strong>LinkedIn note</strong></p><p>${escapeOutreach(draft.linkedin_note)}</p><p><strong>Follow-up (day 5)</strong></p><p>${escapeOutreach(draft.followup)}</p><div class="row"><button type="button" id="email-copy">Copy</button><a id="email-gmail" target="_blank" rel="noreferrer">Open in Gmail</a><a id="email-mailto">Open in mail app</a><button type="button" id="email-mark">Mark emailed</button><button type="button" id="email-follow">Mark followed up</button></div><p id="email-log" class="muted"></p></div>`;
  const gmail = box.querySelector("#email-gmail");
  const mail = box.querySelector("#email-mailto");
  gmail.href = gmailUrl(draft);
  mail.href = mailtoUrl(draft);
  const markEmailed = () => rememberApplication("Emailed", draft.job);
  gmail.addEventListener("click", markEmailed);
  mail.addEventListener("click", markEmailed);
  box.querySelector("#email-copy").onclick = () => navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
  const note = box.querySelector("#email-log");
  const showLog = (entry) => {
    note.textContent = [entry?.emailedAt ? `Emailed ${new Date(entry.emailedAt).toLocaleDateString()}` : "", entry?.followedUpAt ? `Followed up ${new Date(entry.followedUpAt).toLocaleDateString()}` : ""].filter(Boolean).join(" · ");
  };
  showLog(log);
  box.querySelector("#email-mark").onclick = async () => {
    const next = { ...(log || {}), emailedAt: Date.now() };
    const data = await storageGet("local", ["outreachLog"]);
    await storageSet("local", { outreachLog: { ...(data.outreachLog || {}), [outreachKey(draft.job)]: next } });
    showLog(next);
  };
  box.querySelector("#email-follow").onclick = async () => {
    const data = await storageGet("local", ["outreachLog"]);
    const prev = (data.outreachLog || {})[outreachKey(draft.job)] || log || {};
    const next = { ...prev, followedUpAt: Date.now() };
    await storageSet("local", { outreachLog: { ...(data.outreachLog || {}), [outreachKey(draft.job)]: next } });
    showLog(next);
  };
}

$("email-job").addEventListener("click", async () => {
  await ready;
  readProfileForm();
  if (!state.settings.apiKey) {
    setStatus("job-status", "Add your Groq key in Settings first.");
    return;
  }
  const description = $("jd").value.trim();
  if (!description) {
    setStatus("job-status", "Paste a job description first.");
    return;
  }
  const job = {
    title: description.split("\n")[0].slice(0, 120),
    company: state.scan?.company || "",
    description,
    url: state.pageUrl || ""
  };
  const key = outreachKey(job);
  const stored = await storageGet("local", ["outreachCache", "outreachLog"]);
  let draft = stored.outreachCache?.[key];
  if (!draft) {
    setStatus("job-status", "Writing a short email from your real profile…");
    draft = await draftOutreach({ apiKey: state.settings.apiKey, profile: state.profile, job });
    draft.job = job;
    await storageSet("local", { outreachCache: { ...(stored.outreachCache || {}), [key]: draft } });
  } else {
    draft.job = job;
  }
  renderOutreach(draft, stored.outreachLog?.[key]);
  setStatus("job-status", "Email is ready. You send it yourself. Nothing was sent.");
});

$("open-jobs").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("jobs.html") });
});
$("check-jobs").addEventListener("click", async () => {
  setStatus("jobs-status", "Checking public boards…");
  const result = await chrome.runtime.sendMessage({ type: "CHECK_JOBS" });
  setStatus("jobs-status", result?.ok
    ? `${result.added} new matching job${result.added === 1 ? "" : "s"}. Open the dashboard to review them.`
    : (result?.error || "Check failed."));
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const data = await storageGet("session", ["pendingAutofill"]);
  if (!data.pendingAutofill || data.pendingAutofill.tabId !== tabId) return;
  await storageSet("session", { pendingAutofill: null });
  document.querySelector("[data-tab='fill']").click();
  $("scan").click();
});

async function consumePendingTailor() {
  const data = await storageGet("local", ["pendingTailor"]);
  if (!data.pendingTailor?.jd) return;
  $("jd").value = data.pendingTailor.jd;
  document.querySelector("[data-tab='job']").click();
  setStatus("job-status", `Loaded ${data.pendingTailor.title || "a job"}. Press Tailor for this job.`);
  await storageSet("local", { pendingTailor: null });
}

let crmView = "board";
let crmDraft = null;

async function loadCrm() {
  const data = await storageGet("local", [CRM_KEY]);
  return data[CRM_KEY] || { entries: [] };
}
async function saveCrm(book) {
  await storageSet("local", { [CRM_KEY]: book });
  renderCrm(book);
}
async function rememberApplication(stage, job = {}) {
  const posting = {
    url: job.url || state.pageUrl || "",
    title: job.title || $("jd").value.split("\n")[0].slice(0, 120),
    company: job.company || state.scan?.company || "",
    location: job.location || "",
    source: job.source || "",
    description: job.description || $("jd").value
  };
  if (!posting.url && !posting.title) return;
  const book = await loadCrm();
  const entries = upsertEntry(book.entries, { ...posting, stage });
  await saveCrm({ entries });
}

function renderCrm(book) {
  const entries = book?.entries || [];
  const stats = crmStats(entries);
  const statsEl = $("crm-stats");
  if (!statsEl) return;
  statsEl.textContent = `${stats.appliedWeek} applied this week · ${stats.responseRate}% response rate (${stats.responses} of ${stats.considered})`;
  const draft = $("crm-draft");
  draft.innerHTML = crmDraft ? `<div class="card"><p>Check these fields, then save.</p>
    <input id="d-title" value="${escapeOutreach(crmDraft.title)}" placeholder="Role">
    <input id="d-company" value="${escapeOutreach(crmDraft.company)}" placeholder="Company">
    <input id="d-location" value="${escapeOutreach(crmDraft.location)}" placeholder="Location">
    <input id="d-salary" value="${escapeOutreach(crmDraft.salary)}" placeholder="Salary">
    <input id="d-url" value="${escapeOutreach(crmDraft.url)}" placeholder="URL">
    <input id="d-email" value="${escapeOutreach(crmDraft.contactEmail)}" placeholder="Contact email">
    <button type="button" id="d-save">Save job</button></div>` : "";
  if (crmDraft) {
    $("d-save").onclick = async () => {
      const next = {
        ...crmDraft,
        title: $("d-title").value,
        company: $("d-company").value,
        location: $("d-location").value,
        salary: $("d-salary").value,
        url: $("d-url").value,
        contactEmail: $("d-email").value
      };
      const current = await loadCrm();
      await saveCrm({ entries: upsertEntry(current.entries, next) });
      crmDraft = null;
      renderCrm(await loadCrm());
    };
  }
  const list = $("crm-list");
  if (crmView === "table") {
    list.innerHTML = `<table class="crm-table"><tr><th>Role</th><th>Stage</th><th>Follow-up</th></tr>${entries.map((entry) => `<tr><td>${escapeOutreach(entry.company)} · ${escapeOutreach(entry.title)}</td><td>${escapeOutreach(entry.stage)}</td><td>${entry.followUpOn ? escapeOutreach(new Date(entry.followUpOn).toLocaleDateString()) : ""}</td></tr>`).join("")}</table>`;
    return;
  }
  list.innerHTML = `<div class="kanban">${STAGES_SAFE.map((stage) => `<div class="kanban-col"><strong>${stage}</strong>${entries.filter((entry) => entry.stage === stage).map((entry) => `<article class="crm-card" data-id="${escapeOutreach(entry.id)}">
    <strong>${escapeOutreach(entry.title) || "Role"}</strong>
    <div class="muted">${escapeOutreach(entry.company)} · ${escapeOutreach(entry.location)} · ${escapeOutreach(entry.source)}</div>
    <div class="muted">${entry.salary ? escapeOutreach(entry.salary) : ""} ${entry.contactEmail ? `· ${escapeOutreach(entry.contactEmail)}` : ""}</div>
    <textarea data-notes placeholder="Notes">${escapeOutreach(entry.notes)}</textarea>
    <input data-contact placeholder="Contact name" value="${escapeOutreach(entry.contactName)}">
    <div class="row"><a href="${escapeOutreach(entry.url)}" target="_blank" rel="noreferrer">Open job</a><button type="button" data-crm="email">Write email</button><button type="button" data-crm="follow">Mark followed up</button></div>
  </article>`).join("")}</div>`).join("")}</div>`;
}

const STAGES_SAFE = ["Saved", "Applied", "Emailed", "Followed up", "Interview", "Offer", "Rejected"];

async function prepareCrmDraft() {
  document.querySelector("[data-tab='crm']").click();
  let posting = { title: "", company: "", location: "", salary: "", url: state.pageUrl || "", source: "", needsModel: true };
  try {
    const response = await send("EXTRACT_POSTING");
    posting = { ...posting, ...(response.posting || {}) };
    if (posting.needsModel && state.settings.apiKey) {
      const result = await groqChat({
        apiKey: state.settings.apiKey,
        model: MODELS.cheap.id,
        maxTokens: 400,
        messages: crmMessages(response.text || $("jd").value, posting.url)
      });
      posting = { ...posting, ...parseCrmExtract(result.text), needsModel: false };
    }
  } catch {
    posting = { ...posting, title: $("jd").value.split("\n")[0].slice(0, 120), company: state.scan?.company || "" };
  }
  crmDraft = posting;
  renderCrm(await loadCrm());
}

$("save-crm")?.addEventListener("click", () => prepareCrmDraft());
document.addEventListener("jobpilot-crm-save", () => prepareCrmDraft());
$("crm-board")?.addEventListener("click", async () => { crmView = "board"; renderCrm(await loadCrm()); });
$("crm-table")?.addEventListener("click", async () => { crmView = "table"; renderCrm(await loadCrm()); });
$("crm-export")?.addEventListener("click", async () => {
  const book = await loadCrm();
  const blob = new Blob([entriesToCsv(book.entries)], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "jobpilot-crm.csv";
  link.click();
});
$("crm-import")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const incoming = csvToEntries(await file.text());
  let book = await loadCrm();
  incoming.forEach((entry) => { book = { entries: upsertEntry(book.entries, entry) }; });
  await saveCrm(book);
});
$("crm-list")?.addEventListener("click", async (event) => {
  const card = event.target.closest(".crm-card");
  if (!card) return;
  const book = await loadCrm();
  const entry = book.entries.find((item) => item.id === card.dataset.id);
  if (!entry) return;
  if (event.target.dataset.crm === "follow") {
    const entries = book.entries.map((item) => (item.id === entry.id ? setStage(item, "Followed up") : item));
    await saveCrm({ entries });
    return;
  }
  if (event.target.dataset.crm === "email") {
    $("jd").value = `${entry.title}\n${entry.company}\n${entry.location}\n${entry.url}`;
    state.pageUrl = entry.url;
    document.querySelector("[data-tab='job']").click();
    $("email-job").click();
  }
});
$("crm-list")?.addEventListener("change", async (event) => {
  const card = event.target.closest(".crm-card");
  if (!card) return;
  const book = await loadCrm();
  const entries = book.entries.map((entry) => {
    if (entry.id !== card.dataset.id) return entry;
    return {
      ...entry,
      notes: card.querySelector("[data-notes]")?.value || entry.notes,
      contactName: card.querySelector("[data-contact]")?.value || ""
    };
  });
  await saveCrm({ entries });
});

const ready = loadAll().then(() => consumePendingTailor());
