const AUTO = {
  "given-name": "firstName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  tel: "phone",
  url: "portfolio"
};

const SUBMIT_RE = /\b(submit application|submit your application|send application|submit|apply now)\b/i;
const NEXT_RE = /\b(next|continue|save and continue)\b/i;

export function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim();
}

export function classifyButton(text) {
  const value = cleanText(text);
  if (!value) return "other";
  if (SUBMIT_RE.test(value) && !NEXT_RE.test(value)) return "submit";
  if (NEXT_RE.test(value) && !SUBMIT_RE.test(value)) return "next";
  return "other";
}

export function isHidden(el) {
  let node = el;
  while (node && node.nodeType === 1) {
    if (node.hidden || node.getAttribute("hidden") != null) return true;
    if (node.getAttribute("aria-hidden") === "true") return true;
    const style = node.style;
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;
    node = node.parentElement;
  }
  const type = el.getAttribute && el.getAttribute("type");
  return type === "hidden" || type === "password" || type === "search";
}

function purposeFromName(blob) {
  const name = blob || "";
  if (/first[_-]?name|\[first_name\]|legalNameSection_firstName|given-name/i.test(name)) return "firstName";
  if (/last[_-]?name|\[last_name\]|legalNameSection_lastName|family-name/i.test(name)) return "lastName";
  if (/urls\[LinkedIn\]|linkedin/i.test(name)) return "linkedin";
  if (/urls\[(Portfolio|GitHub|Other|Website)\]|portfolio/i.test(name)) return "portfolio";
  if (/_systemfield_email|\bemail\b|email-input/i.test(name)) return "email";
  if (/phone|tel\b/i.test(name)) return "phone";
  if (/_systemfield_name|^name$|\bfull[_-]?name\b/i.test(name)) return "fullName";
  if (/location|\[city\]|addressSection_city|\bcity\b/i.test(name)) return "location";
  if (/resume|cv\b/i.test(name)) return "resumeFile";
  return "";
}

function purposeFromLabel(label) {
  const text = label || "";
  if (/cover\s*letter/i.test(text)) return "coverLetter";
  if (/why\b.{0,50}(company|role|join|work here|work at|interested)|why do you want/i.test(text)) return "whyCompany";
  if (/tell us about yourself|about yourself|introduce yourself/i.test(text)) return "aboutYourself";
  if (text.length > 160) {
    if (/intern|what changed|what did you learn|specific example/i.test(text)) return "openEnded";
    return "";
  }
  if (/first\s*name|given\s*name/i.test(text)) return "firstName";
  if (/last\s*name|family\s*name|surname/i.test(text)) return "lastName";
  if (/^name$|full\s*name|your\s*name/i.test(text)) return "fullName";
  if (/e-?mail/i.test(text)) return "email";
  if (/phone|mobile/i.test(text)) return "phone";
  if (/linkedin/i.test(text)) return "linkedin";
  if (/portfolio|personal site|website|github/i.test(text)) return "portfolio";
  if (/city|location|where are you based/i.test(text)) return "location";
  if (/work auth|authori[sz]ed to work|visa|sponsorship/i.test(text)) return "workAuthorization";
  if (/notice period|when can you start|start date|availability/i.test(text)) return "noticePeriod";
  if (/salary|compensation|expected pay|\bctc\b/i.test(text)) return "salary";
  if (/^cgpa$|your cgpa|grade point|^gpa$/i.test(text)) return "cgpa";
  return "";
}

function purposeFor(el, label) {
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "email") return "email";
  if (type === "tel") return "phone";
  if (type === "file") return "resumeFile";
  const auto = el.getAttribute("autocomplete") || "";
  if (AUTO[auto]) return AUTO[auto];
  const named = purposeFromName([
    el.getAttribute("name"),
    el.id,
    el.getAttribute("data-automation-id")
  ].filter(Boolean).join(" "));
  if (named) return named;
  const fromLabel = purposeFromLabel(label);
  if (fromLabel) return fromLabel;
  const multiline = el.tagName === "TEXTAREA" || el.getAttribute("aria-multiline") === "true";
  if (multiline) return "openEnded";
  return "unknown";
}

function controlLabel(el) {
  const doc = el.ownerDocument;
  if (el.id && doc) {
    const explicit = doc.querySelector(`label[for="${escapeId(el.id)}"]`);
    if (explicit) return cleanText(explicit.textContent);
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return cleanText(aria);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy && doc) {
    const text = labelledBy.split(/\s+/).map((id) => doc.getElementById(id)?.textContent || "").join(" ");
    if (cleanText(text)) return cleanText(text);
  }
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
    const wrap = el.closest("label");
    if (wrap) return cleanText(wrap.textContent);
  }
  return cleanText(el.textContent || el.getAttribute("placeholder") || "");
}

function questionText(el) {
  const item = el.closest("[role='listitem'], .question, .application-question, .field");
  const heading = item && item.querySelector("[role='heading'], legend, .application-label, .question-title");
  if (heading && !el.contains(heading)) return cleanText(heading.textContent);
  const group = el.closest("[role='radiogroup'], [role='group'], fieldset");
  if (group) {
    const legend = group.querySelector("legend");
    if (legend) return cleanText(legend.textContent);
    const aria = group.getAttribute("aria-label");
    if (aria) return cleanText(aria);
  }
  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend) return cleanText(legend.textContent);
  }
  return controlLabel(el);
}

function escapeId(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function detectAts(doc, url = "") {
  const href = String(url || "");
  const marked = doc.querySelector("[data-ats]");
  if (marked) return marked.getAttribute("data-ats");
  if (/docs\.google\.com\/forms|forms\.gle/i.test(href)) return "google-forms";
  if (/greenhouse\.io/i.test(href) || doc.querySelector("input[name='job_application[first_name]'], #application_form")) return "greenhouse";
  if (/jobs\.lever\.co|lever\.co/i.test(href) || doc.querySelector(".application-question, input[name='urls[LinkedIn]']")) return "lever";
  if (/ashbyhq\.com/i.test(href) || doc.querySelector("[name^='_systemfield_']")) return "ashby";
  if (/myworkdayjobs\.com/i.test(href) || doc.querySelector("[data-automation-id*='legalName'], [data-automation-id='email']")) return "workday";
  if (/smartrecruiters\.com/i.test(href) || doc.querySelector("#first-name-input")) return "smartrecruiters";
  if (/linkedin\.com/i.test(href) && doc.querySelector(".jobs-easy-apply-modal, .jobs-easy-apply-content")) return "linkedin";
  if (doc.querySelector("[role='radiogroup'] [role='radio']") && /google/i.test(doc.body?.className || "")) return "google-forms";
  return "generic";
}

function buttonText(el) {
  return cleanText(el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "");
}

function isButtonLike(el) {
  if (el.tagName === "BUTTON") return true;
  if (el.tagName === "INPUT" && /^(submit|button|image)$/i.test(el.getAttribute("type") || "")) return true;
  return el.getAttribute("role") === "button";
}

export function scanDocument(doc, url = "") {
  doc.querySelectorAll("[data-jobpilot-id]").forEach((el) => el.removeAttribute("data-jobpilot-id"));
  let n = 0;
  const nextId = () => `jp${++n}`;
  const seen = new Set();
  const fields = [];

  function addChoice(holder, control, widgets, multiple) {
    const id = nextId();
    const anchor = holder || widgets[0];
    anchor.setAttribute("data-jobpilot-id", id);
    const options = widgets.map((widget) => {
      seen.add(widget);
      const optionId = nextId();
      widget.setAttribute("data-jobpilot-option", optionId);
      return { id: optionId, label: controlLabel(widget) || cleanText(widget.getAttribute?.("value") || "") };
    });
    const label = questionText(anchor);
    fields.push({
      id,
      kind: multiple ? "multi" : "single",
      control,
      purpose: "choice",
      label,
      options,
      openEnded: false
    });
  }

  doc.querySelectorAll("[role='radiogroup']").forEach((group) => {
    if (isHidden(group)) return;
    const radios = [...group.querySelectorAll("[role='radio']")].filter((el) => !isHidden(el));
    if (radios.length) addChoice(group, "aria-radio", radios, false);
  });

  const nativeRadios = [...doc.querySelectorAll("input[type='radio']")].filter((el) => !isHidden(el) && !seen.has(el));
  const radioGroups = new Map();
  nativeRadios.forEach((el) => {
    const key = el.name || nextId();
    if (!radioGroups.has(key)) radioGroups.set(key, []);
    radioGroups.get(key).push(el);
  });
  radioGroups.forEach((list) => {
    const fieldset = list[0].closest("fieldset");
    addChoice(fieldset || null, "radio", list, false);
  });

  doc.querySelectorAll("[role='group']").forEach((group) => {
    if (isHidden(group)) return;
    const boxes = [...group.querySelectorAll("[role='checkbox']")].filter((el) => !isHidden(el) && !seen.has(el));
    if (boxes.length) addChoice(group, "aria-checkbox", boxes, true);
  });

  const nativeBoxes = [...doc.querySelectorAll("input[type='checkbox']")].filter((el) => !isHidden(el) && !seen.has(el));
  const boxGroups = new Map();
  nativeBoxes.forEach((el) => {
    const fieldset = el.closest("fieldset");
    const key = el.name || (fieldset ? `fs:${[...doc.querySelectorAll("fieldset")].indexOf(fieldset)}` : nextId());
    if (!boxGroups.has(key)) boxGroups.set(key, []);
    boxGroups.get(key).push(el);
  });
  boxGroups.forEach((list) => {
    addChoice(list[0].closest("fieldset") || null, "checkbox", list, true);
  });

  doc.querySelectorAll("select").forEach((el) => {
    if (isHidden(el) || seen.has(el)) return;
    seen.add(el);
    const id = nextId();
    el.setAttribute("data-jobpilot-id", id);
    const options = [...el.options].filter((option) => {
      const label = cleanText(option.textContent);
      return option.value && !/^select\b/i.test(label);
    }).map((option) => {
      const optionId = nextId();
      option.setAttribute("data-jobpilot-option", optionId);
      return { id: optionId, label: cleanText(option.textContent), value: option.value };
    });
    fields.push({
      id,
      kind: el.multiple ? "multi" : "single",
      control: "select",
      purpose: "choice",
      label: questionText(el) || controlLabel(el),
      options,
      openEnded: false
    });
  });

  const controls = doc.querySelectorAll("input, textarea, [role='textbox']");
  controls.forEach((el) => {
    if (seen.has(el) || isHidden(el)) return;
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["radio", "checkbox", "submit", "button", "reset", "image", "password", "search", "hidden"].includes(type)) return;
    if (el.tagName === "INPUT" && type && !["text", "email", "tel", "url", "number", "file", ""].includes(type)) return;
    seen.add(el);
    const id = nextId();
    el.setAttribute("data-jobpilot-id", id);
    const label = questionText(el) || controlLabel(el);
    const purpose = purposeFor(el, label);
    const multiline = el.tagName === "TEXTAREA" || el.getAttribute("aria-multiline") === "true" || ["openEnded", "coverLetter", "whyCompany", "aboutYourself"].includes(purpose);
    fields.push({
      id,
      kind: type === "file" ? "file" : multiline ? "textarea" : "text",
      control: type === "file" ? "file" : multiline ? "textarea" : "text",
      purpose,
      label,
      options: [],
      openEnded: multiline && type !== "file"
    });
  });

  const submitButtons = [];
  const nextButtons = [];
  doc.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button']").forEach((el) => {
    if (isHidden(el) || !isButtonLike(el)) return;
    const text = buttonText(el);
    const action = el.getAttribute("type") === "submit" && !NEXT_RE.test(text) ? "submit" : classifyButton(text);
    if (action === "other") return;
    const id = nextId();
    el.setAttribute("data-jobpilot-id", id);
    const record = { id, label: text, action };
    if (action === "submit") submitButtons.push(record);
    else nextButtons.push(record);
  });

  return {
    ats: detectAts(doc, url),
    url: String(url || ""),
    fields,
    submitButtons,
    nextButtons
  };
}
