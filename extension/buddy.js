import {
  buddyPageMatchMessages,
  filterPageJobs,
  mergePageJobs,
  pageMatchBrief,
  parseBuddyPageMatches
} from "./lib/buddy-page.js";
import { isWebPage, pickTab, connectFailureMessage } from "./lib/connect.js";
import { groqChat } from "./lib/groq.js";
import { renderMarkdown } from "./lib/markdown.js";
import { MODELS } from "./lib/models.js";
import { buildBuddySystemPrompt, wantsBuddyPageScan } from "./lib/prompts.js";

const root = document.getElementById("buddy-root");
if (root) startBuddy(root);

const QUESTIONS = [
  "Did you apply to one job today?",
  "Want to practise an SDR cold-call opener?",
  "Shall I tailor your resume for the top job?",
  "How did the last application feel?",
  "Want a 4-line answer for 'tell me about yourself'?"
];

function startBuddy(root) {
  const panel = !!root.closest("#buddy");
  root.classList.toggle("buddy-panel", panel);
  root.classList.toggle("buddy-dock", !panel);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.innerHTML = `<div class="buddy-shell">
    <div class="buddy-head">
      <button type="button" class="buddy-doll idle" id="buddy-doll" aria-label="Buddy">${doll()}</button>
      <button type="button" class="buddy-pop" id="buddy-pop" hidden></button>
    </div>
    <div class="buddy-toolbar">
      <label class="buddy-model-wrap">Model
        <select id="buddy-model">
          <option value="quality">GPT-OSS 120B</option>
          <option value="cheap">GPT-OSS 20B (save credits)</option>
        </select>
      </label>
      <button type="button" id="buddy-scan">Scan this careers page</button>
      <button type="button" id="buddy-unhighlight">Clear highlights</button>
    </div>
    <div class="buddy-messages" id="buddy-log"></div>
    <div class="buddy-compose">
      <div class="buddy-row">
        <input id="buddy-input" placeholder="Ask Buddy" />
        <button type="button" id="buddy-send">Send</button>
      </div>
      <div class="buddy-row">
        <button type="button" id="buddy-mute">Sound on</button>
        <button type="button" id="buddy-clear">Clear</button>
      </div>
    </div>
  </div>`;
  const dollEl = root.querySelector("#buddy-doll");
  const pop = root.querySelector("#buddy-pop");
  const log = root.querySelector("#buddy-log");
  const input = root.querySelector("#buddy-input");
  const muteBtn = root.querySelector("#buddy-mute");
  const modelSel = root.querySelector("#buddy-model");
  let turns = [];
  let muted = false;
  let modelTier = "quality";
  let audioReady = false;
  let ctx;
  let popsLeft = 3;
  let lastTabId = null;

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function paint() {
    log.innerHTML = turns.map((turn) => {
      const body = turn.role === "assistant" ? renderMarkdown(turn.content) : `<p>${escapeText(turn.content)}</p>`;
      const label = turn.role === "user" ? "You" : "Buddy";
      return `<article class="buddy-bubble ${turn.role === "user" ? "me" : "them"}"><span class="buddy-label">${label}</span><div class="buddy-md">${body}</div></article>`;
    }).join("");
    log.scrollTop = log.scrollHeight;
    muteBtn.textContent = muted ? "Sound off" : "Sound on";
    modelSel.value = modelTier;
  }
  function mood(name) {
    dollEl.classList.remove("idle", "nod", "think", "talk", "wave");
    if (!reduce) dollEl.classList.add(name);
    if (name !== "idle" && !reduce) setTimeout(() => { dollEl.classList.remove(name); dollEl.classList.add("idle"); }, 1200);
  }
  function chirp(freq) {
    if (!audioReady || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  }
  function unlock() {
    if (audioReady) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = ctx || new AudioCtx();
    ctx.resume();
    audioReady = true;
  }
  function load() {
    return new Promise((resolve) => chrome.storage.local.get(["buddy", "settings", "profile"], resolve));
  }
  function saveBuddy() {
    return new Promise((resolve) => chrome.storage.local.set({
      buddy: { turns: turns.slice(-10), muted, modelTier }
    }, resolve));
  }
  function buddyModel() {
    return modelTier === "cheap" ? MODELS.cheap.id : MODELS.quality.id;
  }
  async function activeTab() {
    const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const tabs = windows.flatMap((win) => win.tabs || []);
    const picked = pickTab(tabs, focused?.id);
    if (picked?.id) return picked;
    if (focused?.id && isWebPage(focused.url || "")) return focused;
    throw new Error(connectFailureMessage(focused?.url || ""));
  }
  async function injectFrames(tabId) {
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => location.href });
    for (const frame of results) {
      try {
        await chrome.scripting.executeScript({ target: { tabId, frameIds: [frame.frameId] }, files: ["inject.js"] });
      } catch { /* skip blocked frames */ }
    }
  }
  async function askAllFrames(tabId, type, extra = {}) {
    let ids = [];
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => true });
      ids = results.map((item) => item.frameId);
    } catch {
      ids = [0];
    }
    const jobs = [];
    for (const frameId of ids) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type, ...extra }, { frameId });
        if (response?.ok && Array.isArray(response.jobs)) jobs.push(response.jobs);
      } catch { /* no listener */ }
    }
    return jobs;
  }
  async function sendTab(tabId, type, extra = {}) {
    let hit = null;
    const ids = (await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => true })).map((r) => r.frameId);
    for (const frameId of ids) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type, ...extra }, { frameId });
        if (response?.ok) hit = response;
      } catch { /* skip */ }
    }
    return hit;
  }
  async function listJobsOnPage() {
    const tab = await activeTab();
    lastTabId = tab.id;
    if (!isWebPage(tab.url)) throw new Error("Open a careers page first.");
    let lists = await askAllFrames(tab.id, "BUDDY_LIST");
    if (!lists.length) {
      await injectFrames(tab.id);
      lists = await askAllFrames(tab.id, "BUDDY_LIST");
    }
    const merged = mergePageJobs(lists);
    if (!merged.length) throw new Error("I couldn't find job listings on this page.");
    const filtered = filterPageJobs(merged);
    return { tab, all: merged, filtered };
  }
  function formatScanReply(matches, jobs) {
    const rank = [...matches].sort((a, b) => b.score - a.score);
    const lines = rank.map((match) => {
      const job = jobs.find((item) => item.idx === match.idx);
      if (!job) return "";
      return `- **${job.title}** — ${match.score} fit · ${match.reason} · [Open role](${job.href})`;
    }).filter(Boolean);
    return `**Best matches on this page:**\n\n${lines.join("\n")}\n\n**Next step:** Open the top link and use Autofill when you are ready.`;
  }
  async function scanPage(userVisible = true) {
    unlock();
    mood("think");
    const data = await load();
    if (!data.settings?.apiKey) throw new Error("Add your Groq key in Settings first.");
    const { tab, filtered, all } = await listJobsOnPage();
    if (!filtered.length) {
      return "I found listings, but none matched your title and region filters. Turn on **Show region-locked jobs** on the Jobs dashboard if you want those.";
    }
    const result = await groqChat({
      apiKey: data.settings.apiKey,
      model: buddyModel(),
      maxTokens: 1200,
      messages: buddyPageMatchMessages(pageMatchBrief(data.profile), filtered)
    });
    const matches = parseBuddyPageMatches(result.text, filtered.map((job) => job.idx));
    if (!matches.length) throw new Error("I could not score the listings. Try again.");
    await sendTab(tab.id, "BUDDY_HIGHLIGHT", { matches });
    const reply = formatScanReply(matches, all);
    if (userVisible) {
      turns.push({ role: "user", content: "Scan this careers page" });
      turns.push({ role: "assistant", content: reply });
      turns = turns.slice(-10);
      paint();
      await saveBuddy();
      mood("talk");
      chirp(680);
    }
    return reply;
  }
  async function ask(text) {
    unlock();
    chirp(520);
    mood("nod");
    if (!text) return;
    turns.push({ role: "user", content: text });
    turns = turns.slice(-10);
    paint();
    await saveBuddy();
    mood("think");
    const data = await load();
    if (!data.settings?.apiKey) {
      turns.push({ role: "assistant", content: "Add your Groq key in Settings first." });
      paint();
      return;
    }
    if (wantsBuddyPageScan(text)) {
      try {
        const reply = await scanPage(false);
        turns.push({ role: "assistant", content: reply });
        turns = turns.slice(-10);
        paint();
        await saveBuddy();
        mood("talk");
        chirp(680);
        return;
      } catch (error) {
        turns.push({ role: "assistant", content: error.message || "I couldn't scan this page." });
        turns = turns.slice(-10);
        paint();
        await saveBuddy();
        return;
      }
    }
    try {
      const system = buildBuddySystemPrompt(data.profile);
      const context = pageContext ? `\n\nPAGE CONTEXT:\n${pageContext}` : "";
      const result = await groqChat({
        apiKey: data.settings.apiKey,
        model: buddyModel(),
        maxTokens: 900,
        messages: [
          { role: "system", content: system + context },
          ...turns.slice(-10).map((turn) => ({ role: turn.role, content: turn.content }))
        ]
      });
      mood("talk");
      chirp(680);
      const reply = result.text.trim();
      turns.push({ role: "assistant", content: reply });
      if (/sure|yes|good idea|let's/i.test(reply)) mood("nod");
    } catch (error) {
      turns.push({ role: "assistant", content: error.message || "I'm not sure. Try again." });
    }
    turns = turns.slice(-10);
    paint();
    await saveBuddy();
  }
  root.querySelector("#buddy-send").addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    ask(text);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") root.querySelector("#buddy-send").click();
  });
  modelSel.addEventListener("change", () => {
    modelTier = modelSel.value === "cheap" ? "cheap" : "quality";
    saveBuddy();
  });
  root.querySelector("#buddy-scan").addEventListener("click", () => {
    scanPage(true).catch((error) => {
      turns.push({ role: "assistant", content: error.message || "Scan failed." });
      turns = turns.slice(-10);
      paint();
      saveBuddy();
    });
  });
  root.querySelector("#buddy-unhighlight").addEventListener("click", async () => {
    try {
      const tab = lastTabId ? { id: lastTabId } : await activeTab();
      await sendTab(tab.id, "BUDDY_CLEAR_HIGHLIGHTS");
    } catch { /* ignore */ }
  });
  muteBtn.addEventListener("click", () => {
    unlock();
    muted = !muted;
    saveBuddy();
    paint();
  });
  root.querySelector("#buddy-clear").addEventListener("click", () => {
    turns = [];
    saveBuddy();
    paint();
  });
  pop.addEventListener("click", () => {
    const text = pop.textContent;
    pop.hidden = true;
    if (root.classList.contains("buddy-dock")) root.classList.add("open");
    ask(text);
  });
  dollEl.addEventListener("click", () => {
    unlock();
    chirp(440);
    if (root.classList.contains("buddy-dock")) root.classList.toggle("open");
    if (!reduce) mood("wave");
  });
  load().then((data) => {
    turns = (data.buddy?.turns || []).slice(-10);
    muted = !!data.buddy?.muted;
    modelTier = data.buddy?.modelTier === "cheap" ? "cheap" : "quality";
    paint();
    if (!reduce) mood("wave");
  });
  function later() {
    if (popsLeft <= 0 || !panel) return;
    const wait = 120000 + Math.random() * 120000;
    setTimeout(() => {
      popsLeft -= 1;
      pop.hidden = false;
      pop.textContent = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      chirp(760);
      later();
    }, wait);
  }
  later();
}

function doll() {
  return `<svg viewBox="0 0 80 100" aria-hidden="true">
    <ellipse cx="40" cy="78" rx="18" ry="16" fill="#8ef0d0" stroke="#1a2140" stroke-width="3"/>
    <circle cx="40" cy="38" r="22" fill="#ffe56a" stroke="#1a2140" stroke-width="3"/>
    <g class="eye"><circle cx="32" cy="36" r="3" fill="#1a2140"/><circle cx="48" cy="36" r="3" fill="#1a2140"/></g>
    <path class="mouth" d="M32 46 Q40 52 48 46" fill="none" stroke="#1a2140" stroke-width="3" stroke-linecap="round"/>
    <g class="arm"><path d="M58 70 Q72 60 68 48" fill="none" stroke="#1a2140" stroke-width="3" stroke-linecap="round"/></g>
  </svg>`;
}