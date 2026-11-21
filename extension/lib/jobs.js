export const DEFAULT_FILTERS = {
  titles: [
    "sales development representative",
    "sdr",
    "business development representative",
    "bdr",
    "customer success associate",
    "associate technical account manager",
    "technical account manager",
    "implementation specialist",
    "onboarding specialist",
    "growth associate",
    "customer success"
  ],
  remoteOnly: true,
  showLocked: false
};

const LOCKED = /us only|u\.s\. only|usa only|united states only|uk only|united kingdom only|eu only|europe only|european union only|canada only|north america only|must be located|must reside|must live|only candidates in|only applicants|authorized to work in the (us|u\.s\.|uk|eu)|pacific time|eastern time only|uk time ?zone|\bpst\b|\best\b|\bcst\b|\bmst\b/;

export function isRegionLocked(job) {
  const loc = `${job.location || ""} ${job.title || ""}`.toLowerCase();
  const desc = String(job.description || "").toLowerCase().slice(0, 500);
  if (/worldwide|anywhere|global|apac|\bindia\b|\basia\b/.test(loc) && !LOCKED.test(loc)) return false;
  if (LOCKED.test(loc) || LOCKED.test(desc)) return true;
  if (/\b(uk|u\.k\.|united kingdom|usa|u\.s\.|united states|eu|europe|canada)\b/.test(loc) && !/worldwide|anywhere|global|india|apac|asia/.test(loc)) return true;
  return false;
}

export function isSenior(job) {
  const title = String(job.title || "").toLowerCase();
  const blurb = `${title} ${String(job.description || "").slice(0, 280)}`.toLowerCase();
  if (/\b(senior|sr\.|staff|principal|director|vice president|\bvp\b|head of)\b/.test(title)) return true;
  if (/\b([5-9]|1\d)\+?\s*years\b/.test(blurb)) return true;
  if (/\bmanager\b/.test(title) && !/\b(associate|junior|entry|technical account)\b/.test(title)) return true;
  return false;
}

export function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseBoards(text) {
  return String(text || "").split(/\n+/).map((line) => {
    const match = line.trim().match(/^(greenhouse|lever|ashby|smartrecruiters|workable)\s*[:/]\s*([A-Za-z0-9_-]+)\s*$/i);
    if (!match) return null;
    return { kind: match[1].toLowerCase(), slug: match[2] };
  }).filter(Boolean);
}

export function matchJob(job, filters = DEFAULT_FILTERS) {
  const title = String(job.title || "");
  const titleL = title.toLowerCase();
  const titles = filters.titles?.length ? filters.titles : DEFAULT_FILTERS.titles;
  if (!titles.some((term) => titleL.includes(String(term).toLowerCase()))) return false;
  if (isSenior(job)) return false;
  const remote = job.remote || /remote|worldwide|anywhere|global/i.test(`${job.location || ""} ${job.description || ""}`);
  if (filters.remoteOnly !== false && !remote) return false;
  if (!filters.showLocked && isRegionLocked(job)) return false;
  return true;
}

export function jobsNeedingScore(jobs, cache, limit = 25) {
  const cap = Math.max(1, Number(limit) || 25);
  return (jobs || [])
    .filter((job) => job?.id && !cache?.[job.id])
    .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0))
    .slice(0, cap);
}

export function applyScoreCache(jobs, cache) {
  return (jobs || []).map((job) => {
    const hit = cache?.[job.id];
    if (!hit) return job;
    return { ...job, fit: hit.score, reason: hit.reason };
  });
}

export function sortByFit(jobs) {
  return [...(jobs || [])].sort((a, b) => {
    const aScore = Number.isFinite(a.fit) ? a.fit : -1;
    const bScore = Number.isFinite(b.fit) ? b.fit : -1;
    if (bScore !== aScore) return bScore - aScore;
    return (b.postedAt || 0) - (a.postedAt || 0);
  });
}

export function jobsToNotify(fresh, { smartOn, fallback, threshold = 60 }) {
  if (!smartOn || fallback) return fresh || [];
  return (fresh || []).filter((job) => Number.isFinite(job.fit) && job.fit >= threshold);
}

export function profileBrief(profile) {
  const resume = String(profile?.resumeText || "");
  const storyBits = (profile?.stories || []).map((story) => {
    const facts = Array.isArray(story.facts) ? story.facts.join(" ") : String(story.facts || "");
    return `${story.role || ""} ${facts}`.trim();
  }).filter(Boolean);
  const blob = `${storyBits.join("\n")}\n${resume}`;
  const windows = [/solulab/i, /760/, /1,?370/, /dripify/i, /foundertruth/i, /snov/i].map((pattern) => {
    const match = blob.match(pattern);
    if (!match || match.index == null) return "";
    return blob.slice(Math.max(0, match.index - 60), match.index + 160);
  });
  const evidence = [...windows, ...storyBits].join(" ").replace(/\s+/g, " ").trim().slice(0, 700);
  const name = profile?.name || "Padmanava Das";
  const location = profile?.location || "India";
  return `${name}, based in ${location}. Fresher to about 1 year. That outbound work is real experience and a strong fit for entry SDR/BDR, not "no experience". B.Tech CSE 2026, CGPA 7.54/10. Needs remote roles open to India, APAC, Asia, or worldwide. ${evidence}`.slice(0, 1200);
}

export function smartMatchMessages(brief, jobs) {
  const lines = (jobs || []).map((job) => [
    job.id,
    job.title,
    job.company,
    job.location || "Remote",
    String(job.description || "").replace(/\s+/g, " ").slice(0, 600)
  ].join(" | ")).join("\n");
  return [
    {
      role: "system",
      content: "Score each job from 0 to 100. JSON only: {\"jobs\":[{\"id\":\"\",\"score\":0,\"reason\":\"one short line\"}]}. Copy each id exactly. Scores must differ. Entry remote SDR/BDR/CS/TAM open to India or worldwide is 70-90 when outbound experience overlaps. US-only, UK-only, EU-only, or senior/5+ years roles are under 30. Never say he has no experience."
    },
    { role: "user", content: `CANDIDATE:\n${brief}\nJOBS:\n${lines}` }
  ];
}

export function parseFitScores(text, ids) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  const data = JSON.parse(cleaned.slice(start, end + 1));
  const allowed = new Set(ids || []);
  return (data.jobs || []).map((item) => {
    const score = Number(item.score);
    if (!Number.isFinite(score)) return null;
    return {
      id: String(item.id || ""),
      score: Math.max(0, Math.min(100, Math.round(score))),
      reason: String(item.reason || "").replace(/\s+/g, " ").trim().slice(0, 180)
    };
  }).filter((item) => item && allowed.has(item.id));
}

export function mergeJobs(existing, incoming, now = Date.now()) {
  const map = new Map((existing || []).map((job) => [job.id, job]));
  const seenUrls = new Set((existing || []).map((job) => job.url));
  const fresh = [];
  (incoming || []).forEach((job) => {
    if (!job?.id || !job.url || map.has(job.id) || seenUrls.has(job.url)) return;
    seenUrls.add(job.url);
    const row = { ...job, status: "new", firstSeen: now };
    map.set(job.id, row);
    fresh.push(row);
  });
  const jobs = [...map.values()]
    .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0) || (b.firstSeen || 0) - (a.firstSeen || 0))
    .slice(0, 200);
  return { jobs, fresh };
}

function asTime(value) {
  if (!value) return 0;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function row(partial) {
  return {
    id: partial.id,
    url: partial.url,
    title: stripHtml(partial.title),
    company: stripHtml(partial.company),
    location: stripHtml(partial.location),
    remote: !!partial.remote,
    source: partial.source,
    postedAt: partial.postedAt || 0,
    description: stripHtml(partial.description).slice(0, 4000)
  };
}

export function normalizeRemotive(data) {
  return (data?.jobs || []).map((job) => row({
    id: `remotive:${job.id}`,
    url: job.url,
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location,
    remote: true,
    source: "Remotive",
    postedAt: asTime(job.publication_date),
    description: job.description
  })).filter((job) => job.url && job.title);
}

export function normalizeHimalayas(data) {
  return (data?.jobs || []).map((job) => row({
    id: `himalayas:${job.guid || job.applicationLink}`,
    url: job.applicationLink || job.guid,
    title: job.title,
    company: job.companyName,
    location: Array.isArray(job.locationRestrictions) ? job.locationRestrictions.join(", ") : job.locationRestrictions,
    remote: true,
    source: "Himalayas",
    postedAt: asTime(job.pubDate),
    description: job.excerpt || job.description
  })).filter((job) => job.url && job.title);
}

export function normalizeArbeitnow(data) {
  return (data?.data || []).map((job) => row({
    id: `arbeitnow:${job.slug || job.url}`,
    url: job.url,
    title: job.title,
    company: job.company_name,
    location: job.location,
    remote: !!job.remote,
    source: "Arbeitnow",
    postedAt: asTime(job.created_at),
    description: job.description
  })).filter((job) => job.url && job.title);
}

export function normalizeGreenhouse(data, slug, companyName) {
  return (data?.jobs || []).map((job) => row({
    id: `greenhouse:${slug}:${job.id}`,
    url: job.absolute_url,
    title: job.title,
    company: companyName || slug,
    location: job.location?.name || "",
    remote: /remote/i.test(job.location?.name || job.title || ""),
    source: "Greenhouse",
    postedAt: asTime(job.updated_at),
    description: job.content
  })).filter((job) => job.url && job.title);
}

export function normalizeLever(data, slug, companyName) {
  return (Array.isArray(data) ? data : []).map((job) => row({
    id: `lever:${slug}:${job.id}`,
    url: job.hostedUrl,
    title: job.text,
    company: companyName || slug,
    location: job.categories?.location || "",
    remote: /remote/i.test(`${job.categories?.location || ""} ${job.workplaceType || ""}`),
    source: "Lever",
    postedAt: asTime(job.createdAt),
    description: job.descriptionPlain || job.description
  })).filter((job) => job.url && job.title);
}

export function normalizeAshby(data, slug, companyName) {
  return (data?.jobs || []).map((job) => row({
    id: `ashby:${slug}:${job.id}`,
    url: job.jobUrl || job.applyUrl,
    title: job.title,
    company: companyName || slug,
    location: job.location || job.address?.postalAddress || "",
    remote: job.isRemote || /remote/i.test(`${job.location || ""} ${job.employmentType || ""}`),
    source: "Ashby",
    postedAt: asTime(job.publishedAt || job.publishedDate),
    description: job.descriptionPlain || job.descriptionHtml
  })).filter((job) => job.url && job.title);
}

export function normalizeJobicy(data) {
  return (data?.jobs || []).map((job) => row({
    id: `jobicy:${job.id || job.url}`,
    url: job.url,
    title: job.jobTitle,
    company: job.companyName,
    location: job.jobGeo,
    remote: true,
    source: "Jobicy",
    postedAt: asTime(job.pubDate),
    description: job.jobExcerpt || job.jobDescription
  })).filter((job) => job.url && job.title);
}

export function normalizeNomads(data) {
  return (Array.isArray(data) ? data : []).map((job) => row({
    id: `nomads:${job.url}`,
    url: job.url,
    title: job.title,
    company: job.company_name,
    location: job.location || job.category_name,
    remote: true,
    source: "Working Nomads",
    postedAt: asTime(job.pub_date),
    description: job.description
  })).filter((job) => job.url && job.title);
}

export function normalizeSmartRecruiters(data, slug, companyName) {
  return (data?.content || []).map((job) => {
    const loc = job.location || {};
    const place = [loc.city, loc.region, loc.country, loc.remote ? "Remote" : ""].filter(Boolean).join(", ");
    return row({
      id: `smartrecruiters:${slug}:${job.id}`,
      url: job.ref || `https://jobs.smartrecruiters.com/${slug}/${job.id}`,
      title: job.name,
      company: companyName || slug,
      location: place,
      remote: !!loc.remote || /remote/i.test(place),
      source: "SmartRecruiters",
      postedAt: asTime(job.releasedDate),
      description: job.name
    });
  }).filter((job) => job.url && job.title);
}

export function normalizeWorkable(data, slug, companyName) {
  return (data?.jobs || []).map((job) => row({
    id: `workable:${slug}:${job.shortcode || job.url}`,
    url: job.url || job.application_url,
    title: job.title,
    company: companyName || slug,
    location: job.location?.location_str || job.location?.country || "",
    remote: /remote/i.test(job.location?.location_str || job.telecommuting || ""),
    source: "Workable",
    postedAt: asTime(job.published_on || job.created_at),
    description: job.description || job.title
  })).filter((job) => job.url && job.title);
}

export const DEFAULT_BOARDS = [
  { kind: "lever", slug: "Sprinto", company: "Sprinto" },
  { kind: "lever", slug: "gohighlevel", company: "HighLevel" },
  { kind: "smartrecruiters", slug: "freshworks", company: "Freshworks" },
  { kind: "lever", slug: "zeta", company: "Zeta" },
  { kind: "ashby", slug: "atlan", company: "Atlan" },
  { kind: "ashby", slug: "oyster", company: "Oyster" },
  { kind: "lever", slug: "toptal", company: "Toptal" },
  { kind: "greenhouse", slug: "gitlab", company: "GitLab" },
  { kind: "ashby", slug: "zapier", company: "Zapier" },
  { kind: "greenhouse", slug: "canonical", company: "Canonical" },
  { kind: "ashby", slug: "helpscout", company: "Help Scout" },
  { kind: "ashby", slug: "close", company: "Close" },
  { kind: "greenhouse", slug: "intercom", company: "Intercom" },
  { kind: "greenhouse", slug: "twilio", company: "Twilio" },
  { kind: "greenhouse", slug: "okta", company: "Okta" },
  { kind: "greenhouse", slug: "druva", company: "Druva" },
  { kind: "lever", slug: "hevodata", company: "Hevo Data" },
  { kind: "ashby", slug: "spotdraft", company: "SpotDraft" },
  { kind: "smartrecruiters", slug: "swiggy", company: "Swiggy" },
  { kind: "greenhouse", slug: "inmobi", company: "InMobi" },
  { kind: "smartrecruiters", slug: "gong", company: "Gong" },
  { kind: "lever", slug: "outreach", company: "Outreach" },
  { kind: "greenhouse", slug: "salesloft", company: "Salesloft" },
  { kind: "ashby", slug: "apollo", company: "Apollo" },
  { kind: "ashby", slug: "clickup", company: "ClickUp" },
  { kind: "ashby", slug: "webflow", company: "Webflow" },
  { kind: "greenhouse", slug: "calendly", company: "Calendly" },
  { kind: "greenhouse", slug: "asana", company: "Asana" },
  { kind: "greenhouse", slug: "bitwarden", company: "Bitwarden" },
  { kind: "ashby", slug: "1password", company: "1Password" },
  { kind: "ashby", slug: "notion", company: "Notion" },
  { kind: "ashby", slug: "linear", company: "Linear" },
  { kind: "ashby", slug: "ramp", company: "Ramp" },
  { kind: "greenhouse", slug: "brex", company: "Brex" },
  { kind: "ashby", slug: "plaid", company: "Plaid" }
];

export function companyForBoard(kind, slug) {
  const hit = DEFAULT_BOARDS.find((board) => board.kind === kind && board.slug.toLowerCase() === String(slug || "").toLowerCase());
  return hit?.company || slug;
}

export function withDefaultBoards(boards) {
  const merged = [...(boards || [])];
  const have = new Set(merged.map((board) => `${board.kind}:${String(board.slug).toLowerCase()}`));
  DEFAULT_BOARDS.forEach((board) => {
    const key = `${board.kind}:${board.slug.toLowerCase()}`;
    if (!have.has(key)) merged.push(board);
  });
  return merged;
}

export function isRemovedSource(job) {
  const blob = `${job?.source || ""} ${job?.id || ""} ${job?.url || ""}`.toLowerCase();
  return blob.includes("remoteok") || blob.includes("weworkremotely") || blob.includes("we work remotely");
}

export function purgeRemovedSources(state) {
  const jobs = (state?.jobs || []).filter((job) => !isRemovedSource(job));
  const scores = { ...(state?.scores || {}) };
  (state?.jobs || []).filter(isRemovedSource).forEach((job) => { delete scores[job.id]; });
  const lastSources = (state?.lastSources || []).filter((source) => !/remoteok|we work remotely/i.test(source.name || ""));
  return { ...state, jobs, scores, lastSources };
}
