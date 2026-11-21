import { DEFAULT_FILTERS, isRegionLocked, isSenior, matchJob, parseBoards, purgeRemovedSources } from "./lib/jobs.js";
import { CRM_KEY, setStage, upsertEntry } from "./lib/crm.js";
import { EMAIL_TIP, STRATEGY, draftOutreach, gmailUrl, mailtoUrl, outreachKey } from "./lib/outreach.js";

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
  let state = await load();
  const purged = purgeRemovedSources(state);
  if (purged.jobs.length !== (state.jobs || []).length) {
    state = purged;
    await save(state);
  }
  if (state.filtersVersion !== 2) {
    state = {
      ...state,
      filters: { ...DEFAULT_FILTERS, ...(state.filters || {}), titles: DEFAULT_FILTERS.titles },
      showLocked: false,
      scores: {},
      scoreVersion: 2,
      filtersVersion: 2
    };
    await save(state);
  }
  const filters = state.filters || DEFAULT_FILTERS;
  const allJobs = state.jobs || [];
  const listed = allJobs.filter((job) => {
    if (job.status === "dismissed" || job.status === "applied") return true;
    if (isSenior(job)) return false;
    if (!state.showLocked && isRegionLocked(job)) return false;
    return matchJob(job, { ...DEFAULT_FILTERS, ...filters, showLocked: true });
  });
  $("titles").value = (filters.titles || DEFAULT_FILTERS.titles).join("\n");
  $("remote").checked = filters.remoteOnly !== false;
  $("show-locked").checked = !!state.showLocked;
  $("smart").checked = state.smartMatch !== false;
  $("threshold").value = state.smartThreshold ?? 60;
  $("limit").value = state.smartLimit || 25;
  $("interval").value = state.intervalMinutes || 30;
  $("boards").value = (state.boards || []).map((board) => `${board.kind}:${board.slug}`).join("\n");
  const checked = state.lastChecked ? new Date(state.lastChecked).toLocaleString() : "not yet";
  const fresh = listed.filter((job) => job.status === "new").length;
  const tokens = Number.isFinite(state.lastSmartTokens) && state.lastChecked ? ` · ${state.lastSmartTokens} tokens this check` : "";
  const added = Number.isFinite(state.lastAdded) ? `${state.lastAdded} new this check · ` : "";
  $("meta").textContent = `${added}${fresh} still open · last checked ${checked}${tokens}. ${state.lastSummary || ""}`;
  $("error").textContent = state.lastError || "";
  $("sources").innerHTML = (state.lastSources || []).map((source) => `<li>${source.ok ? "ok" : "error"} · ${escapeHtml(source.name)} · ${source.fetched} fetched · ${source.matched} matched${source.error ? ` · ${escapeHtml(source.error)}` : ""}</li>`).join("")
    || "<li>Not checked yet.</li>";
  $("list").innerHTML = listed.map((job) => `<article class="job ${escapeHtml(job.status)}" data-id="${escapeHtml(job.id)}">
    <header>
      <div><strong>${escapeHtml(job.title)}</strong><div class="muted">${escapeHtml(job.company)} · ${escapeHtml(job.location || "Remote")} · ${escapeHtml(job.source)}</div><div class="fit">${Number.isFinite(job.fit) ? `${job.fit} fit · ${escapeHtml(job.reason || "")}` : "not scored"}</div><p class="muted">${STRATEGY}</p>${job.emailedAt || job.followedUpAt ? `<p class="muted">${job.emailedAt ? `Emailed ${escapeHtml(new Date(job.emailedAt).toLocaleDateString())}` : ""}${job.followedUpAt ? ` · Followed up ${escapeHtml(new Date(job.followedUpAt).toLocaleDateString())}` : ""}</p>` : ""}</div>
      <span class="when">${escapeHtml(when(job.postedAt || job.firstSeen))}</span>
    </header>
    <div class="row">
      <button type="button" data-act="tailor">Tailor resume</button>
      <button type="button" data-act="open">Open & autofill</button>
      <button type="button" data-act="applied">Mark applied</button>
      <button type="button" data-act="email">Email the hiring team</button>
      <button type="button" data-act="emailed">Mark emailed</button>
      <button type="button" data-act="followed">Mark followed up</button>
      <button type="button" data-act="dismiss">Dismiss</button>
      <a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">Apply on company site</a>
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

async function markCrmEmailed(job) {
  const data = await new Promise((resolve) => chrome.storage.local.get([CRM_KEY], resolve));
  const book = data[CRM_KEY] || { entries: [] };
  const entries = upsertEntry(book.entries, { ...job, stage: "Emailed", url: job.url });
  const stamped = entries.map((entry) => (entry.url === job.url ? setStage(entry, "Emailed") : entry));
  await new Promise((resolve) => chrome.storage.local.set({ [CRM_KEY]: { entries: stamped } }, resolve));
}

async function showEmail(card, job) {
  const data = await new Promise((resolve) => chrome.storage.local.get(["settings", "profile", "outreachCache"], resolve));
  if (!data.settings?.apiKey) {
    $("error").textContent = "Add your Groq key in Settings first.";
    return;
  }
  const key = outreachKey(job);
  let draft = data.outreachCache?.[key];
  if (!draft) {
    $("meta").textContent = "Writing a short email from your real profile…";
    draft = await draftOutreach({ apiKey: data.settings.apiKey, profile: data.profile, job });
    await new Promise((resolve) => chrome.storage.local.set({ outreachCache: { ...(data.outreachCache || {}), [key]: draft } }, resolve));
  }
  let panel = card.querySelector(".outreach");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "outreach card";
    card.appendChild(panel);
  }
  const toLine = draft.to ? `To: ${escapeHtml(draft.to)}` : EMAIL_TIP;
  panel.innerHTML = `<p>${toLine}</p><p><strong>${escapeHtml(draft.subject)}</strong></p><p>${escapeHtml(draft.body)}</p><p><strong>LinkedIn note</strong></p><p>${escapeHtml(draft.linkedin_note)}</p><p><strong>Follow-up (day 5)</strong></p><p>${escapeHtml(draft.followup)}</p><div class="row"><button type="button" data-act="copy-email">Copy</button><a data-act="gmail" target="_blank" rel="noreferrer">Open in Gmail</a><a data-act="mailto">Open in mail app</a></div><p class="muted">Nothing is sent until you press send in Gmail or your mail app.</p>`;
  panel.querySelector("[data-act=gmail]").href = gmailUrl(draft);
  panel.querySelector("[data-act=mailto]").href = mailtoUrl(draft);
  const markSent = () => markCrmEmailed(job);
  panel.querySelector("[data-act=gmail]").addEventListener("click", markSent);
  panel.querySelector("[data-act=mailto]").addEventListener("click", markSent);
  panel.querySelector("[data-act=copy-email]").onclick = (event) => {
    event.stopPropagation();
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
  };
}

$("list").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const card = button.closest(".job");
  const state = await load();
  const job = (state.jobs || []).find((item) => item.id === card.dataset.id);
  if (!job) return;
  if (button.dataset.act === "email") {
    await showEmail(card, job);
    return;
  }
  if (button.dataset.act === "emailed" || button.dataset.act === "followed") {
    const field = button.dataset.act === "emailed" ? "emailedAt" : "followedUpAt";
    state.jobs = (state.jobs || []).map((item) => (item.id === job.id ? { ...item, [field]: Date.now() } : item));
    await save(state);
    await render();
    return;
  }
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
  state.showLocked = $("show-locked").checked;
  state.smartMatch = $("smart").checked;
  state.smartThreshold = Math.max(0, Math.min(100, Number($("threshold").value) || 60));
  state.smartLimit = Math.max(1, Math.min(25, Number($("limit").value) || 25));
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
