/** Pure helpers for choosing a tab and explaining a failed connection. */

export function isWebPage(url) {
  return /^https?:\/\//i.test(url || "");
}

export function pickTab(tabs, preferredId) {
  const pages = (tabs || []).filter((tab) => tab && tab.id != null && isWebPage(tab.url));
  if (preferredId != null) {
    const preferred = pages.find((tab) => tab.id === preferredId);
    if (preferred) return preferred;
  }
  return pages.find((tab) => tab.active) || pages[0] || null;
}

export function bestScan(results) {
  const usable = (results || []).filter((item) => item?.response?.ok);
  if (!usable.length) return null;
  usable.sort((a, b) => (b.response.fields?.length || 0) - (a.response.fields?.length || 0));
  const best = { ...usable[0].response, frameId: usable[0].frameId };
  if (!best.jd?.text) {
    const withJd = usable.find((item) => item.response.jd?.text);
    if (withJd) best.jd = withJd.response.jd;
  }
  return best;
}

export function connectFailureMessage(url, error) {
  const detail = String(error?.message || error || "").replace(/\s+/g, " ").trim();
  const href = url || "";
  if (/^(chrome|edge|about|devtools|chrome-extension|view-source):/i.test(href) || /chromewebstore\.google\.com/i.test(href)) {
    return "JobPilot can't run on this browser page. Open the job application tab, then scan again.";
  }
  if (href && !isWebPage(href)) {
    return `JobPilot can't run on ${href}. Open the application form, then scan again.`;
  }
  if (/cannot access|extensions gallery|The extensions gallery cannot be scripted/i.test(detail)) {
    return `Chrome blocked JobPilot on this page. ${detail}`;
  }
  if (detail && !/receiving end|could not establish connection/i.test(detail)) {
    return `JobPilot could not connect to this page. ${detail}`;
  }
  return "JobPilot could not connect to this page. On chrome://extensions, click Reload on JobPilot, then scan again.";
}
