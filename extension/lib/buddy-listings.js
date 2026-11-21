const HREF = /job|career|position|opening|posting|apply|greenhouse|lever\.co|ashby|workday|smartrecruiters/i;
const NAV = /^(learn more|apply now|read more|view job|see job)$/i;

export function extractBuddyListings(doc) {
  const root = doc.body || doc.documentElement;
  if (!root) return [];
  const seen = new Set();
  const jobs = [];
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const raw = anchor.getAttribute("href") || "";
    const href = anchor.href || "";
    if (!href || href.startsWith("javascript:") || (!HREF.test(href) && !HREF.test(raw))) return;
    let title = (anchor.textContent || "").replace(/\s+/g, " ").trim();
    const aria = (anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (title.length < 4 || title.length > 140) {
      if (aria.length >= 4 && aria.length <= 140) title = aria;
      else return;
    }
    const host = anchor.closest("article, li, tr, [class*='job'], [class*='posting'], [class*='opening'], [data-job]");
    if (NAV.test(title) && host) {
      const heading = host.querySelector("h1, h2, h3, h4, [class*='title']");
      if (heading) title = (heading.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140);
    }
    if (title.length < 4) return;
    if (seen.has(href)) return;
    seen.add(href);
    let location = "";
    let team = "";
    if (host) {
      const blob = (host.textContent || "").replace(/\s+/g, " ");
      const loc = blob.match(/\b(remote|india|worldwide|apac|hybrid|united states|usa|u\.s\.|uk|europe|emea)\b[^.,;]{0,30}/i);
      if (loc) location = loc[0].trim().slice(0, 80);
      const dept = blob.match(/\b(sales|customer success|engineering|marketing|growth|operations|business development)\b/i);
      if (dept) team = dept[0];
    }
    const idx = jobs.length;
    anchor.setAttribute("data-jobpilot-idx", String(idx));
    jobs.push({ idx, title, location, team, href });
  });
  return jobs.slice(0, 150);
}

export function applyBuddyHighlights(doc, matches) {
  clearBuddyHighlights(doc);
  const sorted = [...(matches || [])].sort((a, b) => b.score - a.score);
  sorted.forEach((match) => {
    const el = doc.querySelector(`[data-jobpilot-idx="${match.idx}"]`);
    if (!el) return;
    const target = el.closest("a[href]") || el;
    target.classList.add("jobpilot-buddy-hit");
    const badge = doc.createElement("span");
    badge.className = "jobpilot-buddy-badge";
    badge.textContent = `JobPilot ${match.score} ⭐`;
    badge.dataset.jobpilotBadge = "1";
    target.insertAdjacentElement("afterend", badge);
  });
  const best = sorted[0];
  if (best) {
    const el = doc.querySelector(`[data-jobpilot-idx="${best.idx}"]`);
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }
  return { highlighted: sorted.length };
}

export function clearBuddyHighlights(doc) {
  (doc || document).querySelectorAll(".jobpilot-buddy-hit").forEach((el) => el.classList.remove("jobpilot-buddy-hit"));
  (doc || document).querySelectorAll(".jobpilot-buddy-badge").forEach((el) => el.remove());
}