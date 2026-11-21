import { groqChat } from "./lib/groq.js";
import { profileBrief } from "./lib/jobs.js";
import { MODELS } from "./lib/models.js";

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
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.innerHTML = `<button type="button" class="buddy-doll idle" id="buddy-doll" aria-label="Buddy">${doll()}</button>
    <div class="buddy-pop" id="buddy-pop" hidden></div>
    <div class="buddy-chat" id="buddy-chat">
      <div class="buddy-log" id="buddy-log"></div>
      <div class="buddy-row">
        <input id="buddy-input" placeholder="Ask Buddy" />
        <button type="button" id="buddy-send">Send</button>
      </div>
      <div class="buddy-row">
        <button type="button" id="buddy-mute">Sound on</button>
        <button type="button" id="buddy-clear">Clear</button>
      </div>
    </div>`;
  const dollEl = root.querySelector("#buddy-doll");
  const pop = root.querySelector("#buddy-pop");
  const log = root.querySelector("#buddy-log");
  const input = root.querySelector("#buddy-input");
  const muteBtn = root.querySelector("#buddy-mute");
  let turns = [];
  let muted = false;
  let audioReady = false;
  let ctx;
  let popsLeft = 3;

  function paint() {
    log.innerHTML = turns.map((turn) => `<p class="${turn.role === "user" ? "me" : ""}"><strong>${turn.role === "user" ? "You" : "Buddy"}:</strong> ${escapeHtml(turn.content)}</p>`).join("");
    log.scrollTop = log.scrollHeight;
    muteBtn.textContent = muted ? "Sound off" : "Sound on";
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
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
    return new Promise((resolve) => chrome.storage.local.set({ buddy: { turns: turns.slice(-10), muted } }, resolve));
  }
  async function ask(text) {
    unlock();
    chirp(520);
    mood("nod");
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
    try {
      const result = await groqChat({
        apiKey: data.settings.apiKey,
        model: MODELS.cheap.id,
        maxTokens: 400,
        messages: [
          { role: "system", content: `You are Buddy, a small job-search helper. Be accurate, short, and friendly. If you are not sure, say "I'm not sure." Do not invent jobs, employers, or numbers. Candidate: ${profileBrief(data.profile)}` },
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
    root.classList.add("open");
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
    muted = !!data.buddy?.muted || !!data.settings?.buddyMuted;
    paint();
    if (!reduce) mood("wave");
  });
  function later() {
    if (popsLeft <= 0) return;
    const wait = 120000 + Math.random() * 120000;
    setTimeout(() => {
      popsLeft -= 1;
      const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      pop.hidden = false;
      pop.textContent = question;
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
