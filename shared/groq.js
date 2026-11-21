import { CHOICE_MODEL } from "./models.js";
import { buildAnswerMessages, buildChoiceMessages } from "./prompts.js";
import { estimateMessages } from "./tokens.js";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export async function groqChat({ apiKey, model, messages, maxTokens }) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      messages
    })
  });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) {
    const message = data?.error?.message || raw.slice(0, 280) || response.statusText;
    throw new Error(`Groq ${response.status}: ${message}`);
  }
  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  const usage = data?.usage || {};
  return {
    text,
    model,
    tokens: usage.total_tokens || estimateMessages(messages),
    promptTokens: usage.prompt_tokens || null,
    completionTokens: usage.completion_tokens || null
  };
}

export async function groqAnswer({ apiKey, model, profile, question, jd, company, wordMin, wordMax }) {
  const messages = buildAnswerMessages({ question, profile, jd, company, wordMin, wordMax });
  const maxTokens = Math.min(700, Math.round(wordMax * 2) + 40);
  return groqChat({ apiKey, model, messages, maxTokens });
}

export async function groqChoice({ apiKey, question, options, profile }) {
  const messages = buildChoiceMessages(question, options, profile);
  const result = await groqChat({
    apiKey,
    model: CHOICE_MODEL,
    messages,
    maxTokens: 40
  });
  const text = result.text.replace(/^["']|["']$/g, "").trim();
  if (!text || /^none$/i.test(text)) return { ...result, index: -1, text: "" };
  const index = options.findIndex((option) => option.toLowerCase() === text.toLowerCase()
    || text.toLowerCase().includes(option.toLowerCase())
    || option.toLowerCase().includes(text.toLowerCase()));
  return { ...result, index, text };
}

export async function groqCheckKey(apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Groq ${response.status}: ${raw.slice(0, 180)}`);
  }
  return true;
}
