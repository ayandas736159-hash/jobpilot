export const DEFAULT_FILTERS = {
  titles: [
    "sdr",
    "bdr",
    "sales development",
    "business development representative",
    "customer success",
    "associate tam",
    "technical account manager"
  ],
  excludeLevel: ["senior", "staff", "principal", "director", "vp ", "head of"],
  remoteOnly: true,
  regions: ["india", "apac", "asia", "worldwide", "anywhere", "global", "remote"]
};

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
    const match = line.trim().match(/^(greenhouse|lever|ashby)\s*[:/]\s*([a-z0-9_-]+)\s*$/i);
    if (!match) return null;
    return { kind: match[1].toLowerCase(), slug: match[2] };
  }).filter(Boolean);
}

function regionOk(job) {
  const loc = `${job.location || ""}`.toLowerCase();
  if (!loc || /worldwide|anywhere|global|remote|india|apac|asia/.test(loc)) return true;
  if (/\b(united states|usa|u\.s\. only|uk only|europe only|canada only|north america only)\b/.test(loc)) return false;
  return true;
}

export function matchJob(job, filters = DEFAULT_FILTERS) {
  const title = String(job.title || "");
  const titleL = title.toLowerCase();
  const titles = filters.titles?.length ? filters.titles : DEFAULT_FILTERS.titles;
  if (!titles.some((term) => titleL.includes(String(term).toLowerCase()))) return false;
  const excluded = (filters.excludeLevel || DEFAULT_FILTERS.excludeLevel).some((term) => titleL.includes(term));
  const junior = /\b(associate|junior|entry|graduate|sdr|bdr)\b/i.test(title);
  if (excluded && !junior) return false;
  const remote = job.remote || /remote|worldwide|anywhere|global/i.test(`${job.location || ""} ${job.description || ""}`);
  if (filters.remoteOnly !== false && !remote) return false;
  if (!regionOk(job)) return false;
  return true;
}

export function mergeJobs(existing, incoming, now = Date.now()) {
  const map = new Map((existing || []).map((job) => [job.id, job]));
  const fresh = [];
  (incoming || []).forEach((job) => {
    if (!job?.id || !job.url || map.has(job.id)) return;
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

export function normalizeRemoteOk(data) {
  return (Array.isArray(data) ? data : []).filter((job) => job && job.position).map((job) => row({
    id: `remoteok:${job.id || job.url}`,
    url: job.url || job.apply_url,
    title: job.position,
    company: job.company,
    location: job.location,
    remote: true,
    source: "RemoteOK",
    postedAt: asTime(job.date || job.epoch),
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

export function normalizeGreenhouse(data, slug) {
  return (data?.jobs || []).map((job) => row({
    id: `greenhouse:${slug}:${job.id}`,
    url: job.absolute_url,
    title: job.title,
    company: slug,
    location: job.location?.name || "",
    remote: /remote/i.test(job.location?.name || job.title || ""),
    source: "Greenhouse",
    postedAt: asTime(job.updated_at),
    description: job.content
  })).filter((job) => job.url && job.title);
}

export function normalizeLever(data, slug) {
  return (Array.isArray(data) ? data : []).map((job) => row({
    id: `lever:${slug}:${job.id}`,
    url: job.hostedUrl,
    title: job.text,
    company: slug,
    location: job.categories?.location || "",
    remote: /remote/i.test(`${job.categories?.location || ""} ${job.workplaceType || ""}`),
    source: "Lever",
    postedAt: asTime(job.createdAt),
    description: job.descriptionPlain || job.description
  })).filter((job) => job.url && job.title);
}

export function normalizeAshby(data, slug) {
  return (data?.jobs || []).map((job) => row({
    id: `ashby:${slug}:${job.id}`,
    url: job.jobUrl || job.applyUrl,
    title: job.title,
    company: slug,
    location: job.location || job.address?.postalAddress || "",
    remote: job.isRemote || /remote/i.test(`${job.location || ""} ${job.employmentType || ""}`),
    source: "Ashby",
    postedAt: asTime(job.publishedAt || job.publishedDate),
    description: job.descriptionPlain || job.descriptionHtml
  })).filter((job) => job.url && job.title);
}

export function normalizeRss(xml, source) {
  const items = [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return items.map((item) => {
    const block = item[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || block.match(/<title>(.*?)<\/title>/i) || [])[1] || "";
    const link = (block.match(/<link>(.*?)<\/link>/i) || [])[1] || "";
    const date = (block.match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1] || "";
    const company = (block.match(/<dc:creator><!\[CDATA\[(.*?)\]\]>/i) || [])[1] || source;
    return row({
      id: `${source}:${link || title}`,
      url: link.trim(),
      title,
      company,
      location: "Remote",
      remote: true,
      source,
      postedAt: asTime(date),
      description: title
    });
  }).filter((job) => job.url && job.title);
}
