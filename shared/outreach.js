import { groqChat } from "./groq.js";
import { profileBrief } from "./jobs.js";
import { MODELS } from "./models.js";

export const STRATEGY = "Apply on the company site first, then send the email or LinkedIn note within 24 hours, then follow up after 5 days.";
export const EMAIL_TIP = "Find the hiring manager on LinkedIn. careers@ or firstname@company.com is a guess — verify it before you send. JobPilot will not invent an address.";

const HIRING = /recruit|talent|career|jobs|hiring|\bhr@|people@|apply@/i;

export function findHiringEmail(text) {
  const found = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return found.find((email) => HIRING.test(email)) || "";
}

export function outreachKey(job) {
  return [job?.id, job?.url, job?.title, job?.company].filter(Boolean).join("|").slice(0, 240);
}

export function outreachMessages(profile, job) {
  const who = profileBrief(profile);
  const links = `Name: ${profile?.name || "Padmanava Das"}. LinkedIn: ${profile?.linkedin || ""}. Portfolio: ${profile?.portfolio || ""}.`;
  return [
    {
      role: "system",
      content: "Write one cold email for this candidate. JSON only: {\"subject\":\"\",\"body\":\"\",\"linkedin_note\":\"\",\"followup\":\"\"}. Body is 90-140 words, personal, specific to the role and company. Use only facts in the candidate block. Include one line on why this company, one proof point, and a soft ask for a 15-minute chat. Sign with his name and include the LinkedIn and portfolio when they are present. linkedin_note is under 300 characters. followup is a short email for 5 days later. Do not invent employers, metrics, or any email address."
    },
    {
      role: "user",
      content: `CANDIDATE:\n${who}\n${links}\nROLE:\n${job?.title || ""}\nCOMPANY:\n${job?.company || ""}\nLOCATION:\n${job?.location || ""}\nPOSTING:\n${String(job?.description || "").slice(0, 900)}`
    }
  ];
}

export function parseOutreach(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return an email.");
  const data = JSON.parse(cleaned.slice(start, end + 1));
  const subject = String(data.subject || "").trim();
  const body = String(data.body || "").trim();
  const linkedin = String(data.linkedin_note || "").trim().slice(0, 300);
  const followup = String(data.followup || "").trim();
  if (!subject || !body) throw new Error("The model returned an empty email.");
  return { subject, body, linkedin_note: linkedin, followup };
}

export async function draftOutreach({ apiKey, profile, job }) {
  const result = await groqChat({
    apiKey,
    model: MODELS.cheap.id,
    maxTokens: 900,
    messages: outreachMessages(profile, job)
  });
  const draft = parseOutreach(result.text);
  draft.to = findHiringEmail(`${job?.description || ""}\n${job?.title || ""}`);
  draft.tokens = result.tokens || 0;
  return draft;
}

export function gmailUrl({ to = "", subject = "", body = "" }) {
  const params = new URLSearchParams({ view: "cm", fs: "1", su: subject, body });
  if (to) params.set("to", to);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function mailtoUrl({ to = "", subject = "", body = "" }) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function wantsOutreach(text) {
  return /\b(write|draft|send)\b.{0,40}\bemail\b|\bcold email\b|\blinkedin note\b/i.test(String(text || ""));
}