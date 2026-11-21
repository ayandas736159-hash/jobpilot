import {
  DEFAULT_FILTERS,
  matchJob,
  mergeJobs,
  normalizeArbeitnow,
  normalizeAshby,
  normalizeGreenhouse,
  normalizeHimalayas,
  normalizeLever,
  normalizeRemoteOk,
  normalizeRemotive,
  normalizeRss
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
  const errors = [];
  const tasks = [
    ["Remotive", "https://remotive.com/api/remote-jobs?category=sales", (text) => normalizeRemotive(JSON.parse(text))],
    ["Remotive support", "https://remotive.com/api/remote-jobs?category=customer-support", (text) => normalizeRemotive(JSON.parse(text))],
    ["RemoteOK", "https://remoteok.com/api", (text) => normalizeRemoteOk(JSON.parse(text))],
    ["Himalayas", "https://himalayas.app/jobs/api", (text) => normalizeHimalayas(JSON.parse(text))],
    ["Arbeitnow", "https://www.arbeitnow.com/api/job-board-api", (text) => normalizeArbeitnow(JSON.parse(text))],
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
      jobs.push(...parse(text).filter((job) => matchJob(job, state.filters || DEFAULT_FILTERS)));
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }));
  return { jobs, errors };
}

async function poll(manual) {
  const state = await loadState();
  const { jobs: found, errors } = await collect(state);
  const first = !state.lastChecked;
  const { jobs, fresh } = mergeJobs(state.jobs || [], found, Date.now());
  const next = {
    ...state,
    jobs,
    lastChecked: Date.now(),
    lastError: errors.slice(0, 4).join(" · ")
  };
  await saveState(next);
  setBadge(jobs);
  const notify = first ? [] : fresh.filter((job) => !job.postedAt || Date.now() - job.postedAt < 1000 * 60 * 60 * 24 * 21);
  notify.slice(0, 5).forEach((job) => {
    chrome.notifications.create(job.id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: `${job.company || "New role"} · ${job.title}`,
      message: job.location || "Remote",
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
