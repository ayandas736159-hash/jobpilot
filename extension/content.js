import { applyBuddyHighlights, clearBuddyHighlights, extractBuddyListings } from "./lib/buddy-listings.js";
import { applyPlan, clickNext, highlightSubmits } from "./lib/fill.js";
import { scanDocument } from "./lib/fields.js";
import { extractJobDescription, guessCompany } from "./lib/jd.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message.type === "SCAN") {
      const scan = scanDocument(document, location.href);
      sendResponse({
        ok: true,
        ...scan,
        jd: extractJobDescription(document),
        company: guessCompany(document, location.href)
      });
      return;
    }
    if (message.type === "EXTRACT_JD") {
      sendResponse({
        ok: true,
        jd: extractJobDescription(document),
        company: guessCompany(document, location.href),
        url: location.href
      });
      return;
    }
    if (message.type === "FILL") {
      const result = applyPlan(document, message.plan || []);
      const guard = highlightSubmits(document);
      sendResponse({ ok: true, ...result, ...guard });
      return;
    }
    if (message.type === "HIGHLIGHT") {
      sendResponse({ ok: true, ...highlightSubmits(document) });
      return;
    }
    if (message.type === "NEXT") {
      const result = clickNext(document);
      sendResponse({ ok: true, ...result });
      return;
    }
    if (message.type === "BUDDY_LIST") {
      const jobs = extractBuddyListings(document);
      sendResponse({ ok: true, jobs, frame: location.href });
      return;
    }
    if (message.type === "BUDDY_HIGHLIGHT") {
      const result = applyBuddyHighlights(document, message.matches || []);
      sendResponse({ ok: true, ...result });
      return;
    }
    if (message.type === "BUDDY_CLEAR_HIGHLIGHTS") {
      clearBuddyHighlights(document);
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "Unknown request." });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || String(error) });
  }
});
