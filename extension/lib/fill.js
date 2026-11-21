import { classifyButton, isHidden } from "./fields.js";

function byId(doc, id) {
  if (!id) return null;
  return doc.querySelector(`[data-jobpilot-id="${id}"]`) || doc.querySelector(`[data-jobpilot-option="${id}"]`);
}

function isSubmitEl(el) {
  if (!el) return false;
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "submit") return true;
  const text = (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  return classifyButton(text) === "submit";
}

function setNativeValue(el, value) {
  const view = el.ownerDocument.defaultView || globalThis;
  const proto = el.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  const EventCtor = view.Event;
  el.dispatchEvent(new EventCtor("input", { bubbles: true }));
  el.dispatchEvent(new EventCtor("change", { bubbles: true }));
}

function activate(el, wantChecked) {
  if (!el || isSubmitEl(el)) return false;
  if (el.tagName === "OPTION") return true;
  if (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox")) {
    el.checked = wantChecked;
    const EventCtor = (el.ownerDocument.defaultView || globalThis).Event;
    el.dispatchEvent(new EventCtor("input", { bubbles: true }));
    el.dispatchEvent(new EventCtor("change", { bubbles: true }));
    return el.checked === wantChecked;
  }
  const role = el.getAttribute("role");
  if (role === "radio") {
    const on = el.getAttribute("aria-checked") === "true";
    if (!on) el.click();
    if (el.getAttribute("aria-checked") !== "true") {
      const group = el.closest("[role='radiogroup']");
      if (group) group.querySelectorAll("[role='radio']").forEach((node) => node.setAttribute("aria-checked", "false"));
      el.setAttribute("aria-checked", "true");
    }
    return true;
  }
  if (role === "checkbox" || role === "option") {
    const on = el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true";
    if (on !== wantChecked) el.click();
    const now = el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true";
    if (now !== wantChecked) {
      if (role === "option") el.setAttribute("aria-selected", wantChecked ? "true" : "false");
      else el.setAttribute("aria-checked", wantChecked ? "true" : "false");
    }
    return true;
  }
  return false;
}

export function applyPlan(doc, plan) {
  const filled = [];
  const skipped = [];
  (plan || []).forEach((item) => {
    const el = byId(doc, item.id);
    if (!el || isSubmitEl(el)) {
      skipped.push({ id: item.id, reason: el ? "submit" : "missing" });
      return;
    }
    if (item.optionId) {
      const option = byId(doc, item.optionId);
      if (!option || isSubmitEl(option)) {
        skipped.push({ id: item.id, reason: "option" });
        return;
      }
      if (el.tagName === "SELECT" && option.tagName === "OPTION") {
        el.value = option.value;
        const EventCtor = (el.ownerDocument.defaultView || globalThis).Event;
        el.dispatchEvent(new EventCtor("change", { bubbles: true }));
      } else {
        activate(option, true);
      }
      filled.push({ id: item.id, optionId: item.optionId, label: item.label || "" });
      return;
    }
    if (Array.isArray(item.optionIds)) {
      item.optionIds.forEach((optionId) => {
        const option = byId(doc, optionId);
        if (option && !isSubmitEl(option)) activate(option, true);
      });
      filled.push({ id: item.id, optionIds: item.optionIds });
      return;
    }
    if (typeof item.value === "string") {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") setNativeValue(el, item.value);
      else if (el.getAttribute("role") === "textbox") {
        el.textContent = item.value;
        const EventCtor = (el.ownerDocument.defaultView || globalThis).Event;
        el.dispatchEvent(new EventCtor("input", { bubbles: true }));
      }
      filled.push({ id: item.id, value: item.value });
    }
  });
  return { filled, skipped };
}

export function highlightSubmits(doc) {
  const marked = [];
  doc.querySelectorAll("[data-jobpilot-id], button, [role='button'], input[type='submit']").forEach((el) => {
    if (!isSubmitEl(el) || isHidden(el)) return;
    el.classList.add("jobpilot-submit-guard");
    el.setAttribute("data-jobpilot-blocked", "1");
    const parent = el.parentElement;
    if (parent && !parent.querySelector(":scope > .jobpilot-submit-note")) {
      const note = doc.createElement("div");
      note.className = "jobpilot-submit-note";
      note.textContent = "JobPilot stops here. Review the form, then submit it yourself.";
      parent.insertBefore(note, el);
    }
    marked.push((el.innerText || el.value || "").trim());
  });
  return { marked };
}

export function clickNext(doc) {
  const buttons = [...doc.querySelectorAll("button, [role='button'], input[type='button']")];
  const next = buttons.find((el) => {
    if (isHidden(el) || isSubmitEl(el)) return false;
    const text = (el.innerText || el.textContent || el.value || "").replace(/\s+/g, " ").trim();
    return classifyButton(text) === "next";
  });
  if (!next) return { ok: false, reason: "No Next button on this page." };
  next.click();
  return { ok: true, label: (next.innerText || next.textContent || "").trim() };
}
