export const CRM_KEY = "jobpilot.crm";
export const STAGES = ["Saved", "Applied", "Emailed", "Followed up", "Interview", "Offer", "Rejected"];
const DAY = 86400000;

export function wantsCrmSave(text) {
  return /\bsave (this|the) job\b/i.test(String(text || ""));
}

function textOf(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function salaryFrom(node) {
  const value = node?.baseSalary?.value || node?.baseSalary;
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const min = value.minValue ?? value.value;
  const max = value.maxValue;
  const unit = value.unitText || node?.baseSalary?.unitText || "";
  if (min && max) return `${min}-${max} ${unit}`.trim();
  return `${min || ""} ${unit}`.trim();
}

export function extractJobPosting(doc, href = "") {
  const scripts = [...(doc.querySelectorAll?.("script[type='application/ld+json']") || [])];
  for (const script of scripts) {
    let data = null;
    try { data = JSON.parse(script.textContent || ""); } catch { data = null; }
    const list = Array.isArray(data) ? data : (data?.["@graph"] || [data]);
    const job = (list || []).find((node) => node && /JobPosting/i.test(String(node["@type"] || "")));
    if (!job) continue;
    const org = job.hiringOrganization?.name || "";
    const address = job.jobLocation?.address || job.jobLocation?.[0]?.address || {};
    const location = textOf([address.addressLocality, address.addressRegion, address.addressCountry, job.jobLocationType].filter(Boolean).join(", "));
    return {
      title: textOf(job.title),
      company: textOf(org),
      location,
      salary: textOf(salaryFrom(job)),
      url: textOf(job.url || href),
      source: sourceFromUrl(job.url || href),
      needsModel: false
    };
  }
  const title = textOf(doc.querySelector?.("h1")?.textContent);
  const company = textOf(doc.querySelector?.("[class*='company'], .company, meta[property='og:site_name']")?.content || doc.querySelector?.("[class*='company'], .company")?.textContent);
  const location = textOf(doc.querySelector?.("[class*='location'], .location")?.textContent);
  const blob = textOf(doc.body?.innerText || "").slice(0, 1500);
  const salary = (blob.match(/(?:₹|\$|£|€)\s?\d[\d,]*(?:\s?-\s?(?:₹|\$|£|€)?\s?\d[\d,]*)?(?:\s*(?:lpa|k|per year|\/yr))?/i) || [])[0] || "";
  const posting = { title, company, location, salary: textOf(salary), url: href, source: sourceFromUrl(href), needsModel: !title || !company };
  return posting;
}

export function sourceFromUrl(url) {
  const host = String(url || "").replace(/^https?:\/\//, "").split("/")[0];
  if (/lever\.co/i.test(host)) return "Lever";
  if (/greenhouse/i.test(host)) return "Greenhouse";
  if (/ashby/i.test(host)) return "Ashby";
  if (/linkedin/i.test(host)) return "LinkedIn";
  return host.replace(/^www\./, "");
}

export function crmMessages(pageText, url) {
  return [
    {
      role: "system",
      content: "Extract the job posting. JSON only: {\"title\":\"\",\"company\":\"\",\"location\":\"\",\"salary\":\"\"}. Use only words on the page. Leave salary empty if it is not shown. Do not invent a company or a pay number."
    },
    { role: "user", content: `URL: ${url}\nPAGE:\n${String(pageText || "").slice(0, 2500)}` }
  ];
}

export function parseCrmExtract(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return job fields.");
  const data = JSON.parse(cleaned.slice(start, end + 1));
  return {
    title: textOf(data.title),
    company: textOf(data.company),
    location: textOf(data.location),
    salary: textOf(data.salary)
  };
}

function plusDays(ms, days) {
  return (ms || Date.now()) + days * DAY;
}

export function emptyCrm() {
  return { entries: [] };
}

export function upsertEntry(entries, incoming, now = Date.now()) {
  const url = String(incoming.url || "").split("#")[0];
  const list = entries || [];
  const idx = list.findIndex((entry) => entry.url && entry.url.split("#")[0] === url && url);
  if (idx >= 0) {
    const prev = list[idx];
    const next = {
      ...prev,
      ...incoming,
      id: prev.id,
      url: prev.url,
      savedAt: prev.savedAt,
      stage: incoming.stage || prev.stage
    };
    if (next.stage === "Applied" && !next.appliedAt) next.appliedAt = now;
    if (next.stage === "Emailed" && !next.emailedAt) next.emailedAt = now;
    if ((next.stage === "Applied" || next.stage === "Saved") && !next.followUpOn) next.followUpOn = plusDays(next.appliedAt || next.savedAt, 5);
    return list.map((entry, index) => (index === idx ? next : entry));
  }
  const savedAt = incoming.savedAt || now;
  const stage = incoming.stage || "Saved";
  const appliedAt = stage === "Applied" ? (incoming.appliedAt || now) : (incoming.appliedAt || null);
  const entry = {
    id: incoming.id || `crm:${now}:${Math.random().toString(36).slice(2, 7)}`,
    url,
    title: textOf(incoming.title),
    company: textOf(incoming.company),
    location: textOf(incoming.location),
    source: textOf(incoming.source),
    salary: textOf(incoming.salary),
    stage,
    notes: incoming.notes || "",
    contactName: incoming.contactName || "",
    contactEmail: incoming.contactEmail || "",
    savedAt,
    appliedAt,
    emailedAt: stage === "Emailed" ? now : (incoming.emailedAt || null),
    followedUpAt: incoming.followedUpAt || null,
    followUpOn: incoming.followUpOn || plusDays(appliedAt || savedAt, 5),
    followUpNotified: null
  };
  return [entry, ...list];
}

export function setStage(entry, stage, now = Date.now()) {
  const next = { ...entry, stage };
  if (stage === "Applied" && !next.appliedAt) next.appliedAt = now;
  if (stage === "Emailed") next.emailedAt = now;
  if (stage === "Followed up") {
    next.followedUpAt = now;
    next.followUpOn = plusDays(now, 5);
    next.followUpNotified = null;
  }
  if (!next.followUpOn) next.followUpOn = plusDays(next.appliedAt || next.savedAt || now, 5);
  return next;
}

export function dueFollowUps(entries, now = Date.now()) {
  return (entries || []).filter((entry) => entry.followUpOn && entry.followUpOn <= now && entry.followUpNotified !== entry.followUpOn && !["Offer", "Rejected"].includes(entry.stage));
}

export function crmStats(entries, now = Date.now()) {
  const weekAgo = now - 7 * DAY;
  const appliedWeek = (entries || []).filter((entry) => entry.appliedAt && entry.appliedAt >= weekAgo).length;
  const considered = (entries || []).filter((entry) => entry.stage !== "Saved");
  const responses = considered.filter((entry) => entry.stage === "Interview" || entry.stage === "Offer").length;
  const rate = considered.length ? Math.round((responses / considered.length) * 100) : 0;
  return { appliedWeek, responseRate: rate, considered: considered.length, responses };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const COLUMNS = ["url", "title", "company", "location", "source", "salary", "stage", "notes", "contactName", "contactEmail", "savedAt", "appliedAt", "emailedAt", "followedUpAt", "followUpOn"];

export function entriesToCsv(entries) {
  const lines = [COLUMNS.join(",")];
  (entries || []).forEach((entry) => {
    lines.push(COLUMNS.map((key) => csvCell(entry[key])).join(","));
  });
  return lines.join("\n");
}

export function csvToEntries(csv) {
  const rows = parseCsv(String(csv || "").trim());
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim());
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => {
    const record = {};
    header.forEach((key, index) => { record[key] = row[index] || ""; });
    ["savedAt", "appliedAt", "emailedAt", "followedUpAt", "followUpOn"].forEach((key) => {
      record[key] = record[key] ? Number(record[key]) : null;
    });
    if (!STAGES.includes(record.stage)) record.stage = "Saved";
    return record;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((item) => item !== "")) rows.push(row);
  return rows;
}
