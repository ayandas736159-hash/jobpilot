const HREF = /job|career|position|opening|posting|greenhouse|lever\.co|ashby|workday|smartrecruiters/i;

export function extractBuddyListings(doc) {
  const root = doc.body || doc.documentElement;
  if (!root) return [];
  const seen = new Set();
  const jobs = [];
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const raw = anchor.getAttribute("href") || "";
    const href = anchor.href || raw;
    if (!href || href.startsWith("javascript:") || (!HREF.test(href) && !HREF.test(raw) && !anchor.classList.contains("job__link"))) return;
    const named = (anchor.getAttribute("data-ga-name") || "").replace(/\s+/g, " ").trim();
    let title = named || (anchor.textContent || "").replace(/\s+/g, " ").trim();
    if (title.length > 180) title = title.slice(0, 180);
    if (title.length < 4) return;
    if (seen.has(href)) return;
    seen.add(href);
    const card = anchor.closest(".job, article, li, tr") || anchor.parentElement;
    const locEl = card?.querySelector("p, .location, .job-location");
    let location = (locEl && locEl !== anchor ? locEl.textContent : "").replace(/\s+/g, " ").trim();
    if (!location) {
      const loc = `${title}`.match(/\b(remote[^,]{0,40}|india|united states|apac|worldwide)\b/i);
      if (loc) location = loc[0];
    }
    const section = anchor.closest("article, .department-accordion, .accordion, section");
    const team = (anchor.getAttribute("data-ga-location") || section?.querySelector("h2, h3")?.textContent || "")
      .replace(/\s+/g, " ").trim().slice(0, 80);
    const idx = jobs.length;
    anchor.setAttribute("data-jobpilot-idx", String(idx));
    jobs.push({ idx, title, location: location.slice(0, 80), team, href });
  });
  return jobs.slice(0, 150);
}

function reveal(doc, el) {
  let node = el;
  while (node && node !== doc.body && node !== doc.documentElement) {
    if (node.hidden) node.hidden = false;
    if (node.style && node.style.display === "none") node.style.display = "";
    if (node.tagName === "DETAILS") node.open = true;
    const id = node.getAttribute?.("id");
    if (id) {
      const btn = doc.querySelector(`[aria-controls="${id}"]`);
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
    node = node.parentElement;
  }
  const acc = el.closest(".department-accordion, .accordion, article");
  acc?.querySelectorAll("button").forEach((button) => button.setAttribute("aria-expanded", "true"));
}

export function applyBuddyHighlights(doc, matches) {
  clearBuddyHighlights(doc);
  const sorted = [...(matches || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  sorted.forEach((match) => {
    const el = doc.querySelector(`[data-jobpilot-idx="${match.idx}"]`);
    if (!el) return;
    reveal(doc, el);
    const target = el.closest("a[href]") || el;
    target.classList.add("jobpilot-buddy-hit");
    const badge = doc.createElement("span");
    badge.className = "jobpilot-buddy-badge";
    badge.textContent = Number.isFinite(match.score) ? `JobPilot ${match.score} ⭐` : "JobPilot";
    badge.dataset.jobpilotBadge = "1";
    target.insertAdjacentElement("afterend", badge);
  });
  const best = sorted[0];
  if (best) {
    const el = doc.querySelector(`[data-jobpilot-idx="${best.idx}"]`);
    if (el) {
      reveal(doc, el);
      el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }
  return { highlighted: sorted.length };
}

export function clearBuddyHighlights(doc) {
  const root = doc || document;
  root.querySelectorAll(".jobpilot-buddy-hit").forEach((el) => el.classList.remove("jobpilot-buddy-hit"));
  root.querySelectorAll(".jobpilot-buddy-badge").forEach((el) => el.remove());
}