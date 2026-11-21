import { DEFAULT_FILTERS, matchJob, profileBrief } from "./jobs.js";

export function filterPageJobs(jobs, filters = DEFAULT_FILTERS) {
  return (jobs || []).filter((job) => matchJob({
    title: job.title,
    location: job.location || "",
    description: `${job.team || ""} ${job.location || ""}`,
    remote: /remote|worldwide|anywhere|global|wfh/i.test(`${job.location || ""} ${job.title || ""}`)
  }, { ...DEFAULT_FILTERS, ...filters, showLocked: false }));
}

export function mergePageJobs(frames) {
  const seen = new Set();
  const merged = [];
  (frames || []).forEach((list) => {
    (list || []).forEach((job) => {
      const href = String(job.href || "").trim();
      if (!href || seen.has(href)) return;
      seen.add(href);
      merged.push({ ...job, idx: merged.length });
    });
  });
  return merged.slice(0, 150);
}

export function buddyPageMatchMessages(brief, jobs) {
  const lines = (jobs || []).map((job) => [
    job.idx,
    job.title,
    job.location || "",
    job.team || "",
    job.href
  ].join(" | ")).join("\n");
  return [
    {
      role: "system",
      content: "Pick the best job listings for this candidate. JSON only: {\"matches\":[{\"idx\":0,\"score\":0,\"reason\":\"one short line\"}]}. Copy idx exactly. Return up to 8 matches. Scores must differ. Only use idx values from the list."
    },
    { role: "user", content: `CANDIDATE:\n${brief}\nPAGE JOBS:\n${lines}` }
  ];
}

export function parseBuddyPageMatches(text, idxs) {
  const allowed = new Set(idxs);
  const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  const payload = JSON.parse(cleaned.slice(start, end + 1));
  const list = Array.isArray(payload.matches) ? payload.matches : [];
  return list.map((item) => {
    const idx = Number(item.idx);
    const score = Number(item.score);
    if (!allowed.has(idx) || !Number.isFinite(score)) return null;
    return { idx, score: Math.max(0, Math.min(100, Math.round(score))), reason: String(item.reason || "").slice(0, 120) };
  }).filter(Boolean);
}

export function pageMatchBrief(profile) {
  return profileBrief(profile);
}