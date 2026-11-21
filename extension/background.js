import { groqChat } from "./lib/groq.js";
import { MODELS } from "./lib/models.js";
import {
  DEFAULT_FILTERS,
  applyScoreCache,
  jobsNeedingScore,
  jobsToNotify,
  matchJob,
  mergeJobs,
  normalizeArbeitnow,
  normalizeAshby,
  normalizeGreenhouse,
  normalizeHimalayas,
  normalizeLever,
  normalizeJobicy,
  normalizeNomads,
  normalizeRemoteOk,
  normalizeRemotive,
  normalizeRss,
  parseFitScores,
  profileBrief,
  smartMatchMessages,
  sortByFit
} from "./lib/jobs.js";

const ALARM = "jobpilot-jobs";
const STORE = "jobpilot.jobs";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  loadState().then((state) => ensureAlarm(state.intervalMinutes || 30));
});
chrome.runtime.onStartup.addListener(() => {
  loadState().then((state) => ensureAlarm(state.intervalMinutes || 30));
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) poll(false);
});

chrome.notifications.onClicked.addListener(async (id) => {
  const state = await loadState();
  if (id === "jobpilot-more") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("jobs.html") });
    return;
  }
  const job = (state.jobs || []).find((item) => item.id === id);
  if (job?.url) await chrome.tabs.create({ url: job.url });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CHECK_JOBS") {
    poll(true).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "REFRESH_BADGE") {
    loadState().then((state) => setBadge(state.jobs || [])).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "SET_ALARM") {
    ensureAlarm(message.minutes);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

function ensureAlarm(minutes) {
  const period = Math.max(15, Number(minutes) || 30);
  chrome.alarms.create(ALARM, { periodInMinutes: period, delayInMinutes: 1 });
}

function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORE], (data) => resolve(data[STORE] || { jobs: [], filters: DEFAULT_FILTERS, boards: [], intervalMinutes: 30 }));
  });
}

function saveState(state) {
  return new Promise((resolve) => chrome.storage.local.set({ [STORE]: state }, resolve));
}

function setBadge(jobs) {
  const count = jobs.filter((job) => job.status === "new").length;
  chrome.action.setBadgeBackgroundColor({ color: "#0e6b58" });
  chrome.action.setBadgeText({ text: count ? String(Math.min(count, 99)) : "" });
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: "application/json, application/rss+xml, text/xml" } });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
}

async function collect(state) {
  const jobs = [];
  const sources = [];
  const tasks = [
    ["Remotive sales", "https://remotive.com/api/remote-jobs?category=sales", (text) => normalizeRemotive(JSON.parse(text))],
    ["Remotive support", "https://remotive.com/api/remote-jobs?category=customer-support", (text) => normalizeRemotive(JSON.parse(text))],
    ["RemoteOK", "https://remoteok.com/api", (text) => normalizeRemoteOk(JSON.parse(text))],
    ["Himalayas", "https://himalayas.app/jobs/api", (text) => normalizeHimalayas(JSON.parse(text))],
    ["Arbeitnow", "https://www.arbeitnow.com/api/job-board-api", (text) => normalizeArbeitnow(JSON.parse(text))],
    ["Jobicy", "https://jobicy.com/api/v2/remote-jobs?count=50&tag=sales", (text) => normalizeJobicy(JSON.parse(text))],
    ["Working Nomads", "https://www.workingnomads.com/api/exposed_jobs/", (text) => normalizeNomads(JSON.parse(text))],
    ["We Work Remotely", "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss", (text) => normalizeRss(text, "We Work Remotely")]
  ];
  (state.boards || []).forEach((board) => {
    if (board.kind === "greenhouse") {
      tasks.push([`Greenhouse ${board.slug}`, `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`, (text) => normalizeGreenhouse(JSON.parse(text), board.slug)]);
    } else if (board.kind === "lever") {
      tasks.push([`Lever ${board.slug}`, `https://api.lever.co/v0/postings/${board.slug}?mode=json`, (text) => normalizeLever(JSON.parse(text), board.slug)]);
    } else if (board.kind === "ashby") {
      tasks.push([`Ashby ${board.slug}`, `https://api.ashbyhq.com/posting-api/job-board/${board.slug}`, (text) => normalizeAshby(JSON.parse(text), board.slug)]);
    }
  });
  await Promise.all(tasks.map(async ([name, url, parse]) => {
    try {
      const text = await fetchText(url);
      const parsed = parse(text);
      const matched = parsed.filter((job) => matchJob(job, state.filters || DEFAULT_FILTERS));
      jobs.push(...matched);
      sources.push({ name, ok: true, fetched: parsed.length, matched: matched.length, error: "" });
    } catch (error) {
      sources.push({ name, ok: false, fetched: 0, matched: 0, error: String(error.message || error).slice(0, 80) });
    }
  }));
  return { jobs, sources };
}

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (data) => resolve(data[key])));
}

async function scoreJobs(state, jobs) {
  const smartOn = state.smartMatch !== false;
  const cache = { ...(state.scores || {}) };
  if (!smartOn) return { jobs: sortByFit(applyScoreCache(jobs, cache)), cache, tokens: 0, fallback: false, note: "" };
  const todo = jobsNeedingScore(jobs, cache, state.smartLimit || 25);
  if (!todo.length) return { jobs: sortByFit(applyScoreCache(jobs, cache)), cache, tokens: 0, fallback: false, note: "" };
  const settings = await storageGet("settings");
  const apiKey = settings?.apiKey || "";
  if (!apiKey) {
    return { jobs: sortByFit(applyScoreCache(jobs, cache)), cache, tokens: 0, fallback: true, note: "Smart match needs a Groq key. Keyword matches were kept." };
  }
  try {
    const profile = await storageGet("profile");
    const result = await groqChat({
      apiKey,
      model: MODELS.cheap.id,
      messages: smartMatchMessages(profileBrief(profile), todo),
      maxTokens: 1200
    });
    const parsed = parseFitScores(result.text, todo.map((job) => job.id));
    if (!parsed.length) throw new Error("no usable scores");
    parsed.forEach((item) => {
      cache[item.id] = { score: item.score, reason: item.reason };
    });
    const scoredIds = new Set(jobs.map((job) => job.id));
    Object.keys(cache).forEach((id) => { if (!scoredIds.has(id)) delete cache[id]; });
    return {
      jobs: sortByFit(applyScoreCache(jobs, cache)),
      cache,
      tokens: result.tokens || 0,
      fallback: false,
      note: ""
    };
  } catch (error) {
    return {
      jobs: sortByFit(applyScoreCache(jobs, cache)),
      cache,
      tokens: 0,
      fallback: true,
      note: `Smart match skipped (${error.message}). Keyword matches were kept.`
    };
  }
}

async function poll(manual) {
  const state = await loadState();
  if (state.scoreVersion !== 2 || state.filtersVersion !== 2) {
    state.scores = {};
    state.scoreVersion = 2;
    state.filters = { ...DEFAULT_FILTERS, ...(state.filters || {}), titles: DEFAULT_FILTERS.titles };
    state.showLocked = false;
    state.filtersVersion = 2;
  }
  const { jobs: found, sources } = await collect(state);
  const first = !state.lastChecked;
  const { jobs: merged, fresh } = mergeJobs(state.jobs || [], found, Date.now());
  const scored = await scoreJobs(state, merged);
  const jobs = scored.jobs;
  const sourceErrors = sources.filter((item) => !item.ok).map((item) => `${item.name}: ${item.error}`);
  const note = [scored.note, sourceErrors.slice(0, 3).join(" · ")].filter(Boolean).join(" · ");
  const summary = first
    ? `First check saved ${fresh.length} jobs. Notifications start on the next check.`
    : `${fresh.length} new this check. ${jobs.length} saved.`;
  const next = {
    ...state,
    jobs,
    scores: scored.cache,
    lastChecked: Date.now(),
    lastSmartTokens: scored.tokens,
    lastSources: sources,
    lastAdded: fresh.length,
    lastSummary: summary,
    lastError: note
  };
  await saveState(next);
  setBadge(jobs);
  const recent = fresh.filter((job) => !job.postedAt || Date.now() - job.postedAt < 1000 * 60 * 60 * 24 * 21);
  const withScores = recent.map((job) => jobs.find((item) => item.id === job.id) || job);
  const notify = first ? [] : jobsToNotify(withScores, {
    smartOn: state.smartMatch !== false,
    fallback: scored.fallback,
    threshold: state.smartThreshold ?? 60
  });
  notify.slice(0, 5).forEach((job) => {
    chrome.notifications.create(job.id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: `${job.company || "New role"} · ${job.title}`,
      message: Number.isFinite(job.fit) ? `${job.fit} fit · ${job.reason || job.location || "Remote"}` : (job.location || "Remote"),
      priority: 2
    });
  });
  if (notify.length > 5) {
    chrome.notifications.create("jobpilot-more", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: `${notify.length - 5} more matching jobs`,
      message: "Open the JobPilot jobs dashboard.",
      priority: 1
    });
  }
  return { ok: true, added: fresh.length, total: jobs.length, manual, error: next.lastError };
}

loadState().then((state) => ensureAlarm(state.intervalMinutes || 30));
