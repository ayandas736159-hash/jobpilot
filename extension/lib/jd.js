const SELECTORS = [
  "[data-automation-id='jobPostingDescription']",
  ".jobs-description__content",
  ".jobs-description-content__text",
  ".job__description",
  ".job-description",
  "#job-description",
  "[data-qa='job-description']",
  "[data-testid='job-description']",
  ".ashby-job-posting-description",
  ".posting-page .section-wrapper",
  ".content-intro + .content"
];

function textOf(el) {
  return String(el?.innerText || el?.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractJobDescription(doc) {
  for (let i = 0; i < SELECTORS.length; i += 1) {
    const el = doc.querySelector(SELECTORS[i]);
    const text = textOf(el);
    if (text.length > 80) {
      return { text: text.slice(0, 8000), title: doc.title || "", source: SELECTORS[i] };
    }
  }
  const root = doc.querySelector("main, article, [role='main']");
  if (root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("form, nav, footer, script, style, .jobpilot-submit-note").forEach((node) => node.remove());
    const text = textOf(clone);
    if (text.length > 80) return { text: text.slice(0, 8000), title: doc.title || "", source: "main" };
  }
  return { text: "", title: doc.title || "", source: "" };
}

export function guessCompany(doc, url = "") {
  const og = doc.querySelector("meta[property='og:site_name']")?.getAttribute("content");
  if (og) return og.trim();
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!host || /localhost|127\.0\.0\.1|greenhouse|lever|ashby|workday|smartrecruiters|linkedin|google/.test(host)) return "";
    return host.split(".")[0];
  } catch {
    return "";
  }
}
