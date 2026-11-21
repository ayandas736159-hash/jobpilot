import { DEFAULT_FILTERS, parseBoards } from "./lib/jobs.js";

const STORE = "jobpilot.jobs";
const $ = (id) => document.getElementById(id);

function load() {
  return new Promise((resolve) => chrome.storage.local.get([STORE], (data) => resolve(data[STORE] || {})));
}
function save(state) {
  return new Promise((resolve) => chrome.storage.local.set({ [STORE]: state }, resolve));
}

function when(ms) {
  if (!ms) return "Time unknown";
  const delta = Date.now() - ms;
  const hours = Math.round(delta / 3600000);
  if (hours < 1) return "Just posted";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

async function render() {
  const state = await load();
  const jobs = state.jobs || [];
  const filters = state.filters || DEFAULT_FILTERS;
  $("titles").value = (filters.titles || DEFAULT_FILTERS.titles).join("\n");
  $("remote").checked = filters.remoteOnly !== false;
  $("interval").value = state.intervalMinutes || 30;
  $("boards").value = (state.boards || []).map((board) => `${board.kind}:${board.slug}`).join("\n");
  const checked = state.lastChecked ? new Date(state.lastChecked).toLocaleString() : "not yet";
  const fresh = jobs.filter((job) => job.status === "new").length;
  $("meta").textContent = `${fresh} new · ${jobs.length} saved · last checked ${checked}`;
  $("error").textContent = state.lastError || "";
  $("list").innerHTML = jobs.map((job) => `<article class="job ${escapeHtml(job.status)}" data-id="${escapeHtml(job.id)}">
    <header>
      <div><strong>${escapeHtml(job.title)}</strong><div class="muted">${escapeHtml(job.company)} · ${escapeHtml(job.location || "Remote")} · ${escapeHtml(job.source)}</div></div>
      <span class="when">${escapeHtml(when(job.postedAt || job.firstSeen))}</span>
    </header>
    <div class="row">
      <button type="button" data-act="tailor">Tailor resume</button>
      <button type="button" data-act="open">Open & autofill</button>
      <button type="button" data-act="applied">Mark applied</button>
      <button type="button" data-act="dismiss">Dismiss</button>
      <a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">Source</a>
    </div>
  </article>`).join("") || `<p class="muted">No matching jobs yet. Check now, or add a company board.</p>`;
}

async function updateStatus(id, status) {
  const state = await load();
  state.jobs = (state.jobs || []).map((job) => (job.id === id ? { ...job, status } : job));
  await save(state);
  chrome.runtime.sendMessage({ type: "REFRESH_BADGE" });
  await render();
}

$("list").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const card = button.closest(".job");
  const state = await load();
  const job = (state.jobs || []).find((item) => item.id === card.dataset.id);
  if (!job) return;
  if (button.dataset.act === "applied" || button.dataset.act === "dismiss") {
    await updateStatus(job.id, button.dataset.act === "applied" ? "applied" : "dismissed");
    return;
  }
  if (button.dataset.act === "tailor") {
    await chrome.storage.local.set({
      pendingTailor: {
        jd: job.description || `${job.title} at ${job.company}. ${job.location || "Remote"}.`,
        title: job.title,
        company: job.company,
        url: job.url
      }
    });
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    return;
  }
  if (button.dataset.act === "open") {
    const tab = await chrome.tabs.create({ url: job.url });
    await chrome.storage.session.set({ pendingAutofill: { tabId: tab.id, url: job.url } });
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

$("check").addEventListener("click", async () => {
  $("meta").textContent = "Checking public job boards…";
  const result = await chrome.runtime.sendMessage({ type: "CHECK_JOBS" });
  if (!result?.ok) $("error").textContent = result?.error || "Check failed.";
  await render();
});

$("save").addEventListener("click", async () => {
  const state = await load();
  const minutes = Math.max(15, Number($("interval").value) || 30);
  state.filters = {
    ...DEFAULT_FILTERS,
    ...(state.filters || {}),
    titles: $("titles").value.split(/\n+/).map((line) => line.trim()).filter(Boolean),
    remoteOnly: $("remote").checked
  };
  state.boards = parseBoards($("boards").value);
  state.intervalMinutes = minutes;
  await save(state);
  chrome.runtime.sendMessage({ type: "SET_ALARM", minutes });
  await render();
});

$("theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  chrome.storage.local.get(["settings"], (data) => {
    chrome.storage.local.set({ settings: { ...(data.settings || {}), theme: next } });
  });
});

chrome.storage.local.get(["settings"], (data) => {
  if (data.settings?.theme) document.documentElement.dataset.theme = data.settings.theme;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORE]) render();
});
render();
