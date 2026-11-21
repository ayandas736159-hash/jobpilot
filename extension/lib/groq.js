import { CHOICE_MODEL } from "./models.js";
import { buildAnswerMessages, buildChoiceMessages } from "./prompts.js";
import { estimateMessages } from "./tokens.js";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (!part || part.type === "reasoning" || part.type === "thinking") return "";
      if (typeof part.text === "string") return part.text;
      return "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

export function visibleAnswer(content) {
  return messageText(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}

/** Read the answer field. Reasoning is not the answer. Empty content is an error. */
export function answerTextFromCompletion(data) {
  const choice = data?.choices?.[0] || {};
  const text = visibleAnswer(choice.message?.content);
  if (text) return text;
  const finish = choice.finish_reason || "";
  if (finish === "length") {
    throw new Error("Groq returned no answer. The token limit was used up before the reply. Press Write answers to retry.");
  }
  throw new Error("Groq returned an empty answer. Press Write answers to retry.");
}

export function chatRequestBody({ model, messages, maxTokens }) {
  const limit = Math.max(64, Number(maxTokens) || 64);
  const body = {
    model,
    temperature: 0.4,
    max_completion_tokens: limit,
    max_tokens: limit,
    messages
  };
  if (/gpt-oss/i.test(model || "")) {
    body.reasoning_effort = "low";
    body.reasoning_format = "hidden";
  }
  return body;
}

export async function groqChat({ apiKey, model, messages, maxTokens }) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(chatRequestBody({ model, messages, maxTokens }))
  });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) {
    const message = data?.error?.message || raw.slice(0, 280) || response.statusText;
    throw new Error(`Groq ${response.status}: ${message}`);
  }
  const text = answerTextFromCompletion(data);
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
  const maxTokens = Math.max(900, Math.round((wordMax || 150) * 3));
  return groqChat({ apiKey, model, messages, maxTokens });
}

export async function groqChoice({ apiKey, question, options, profile }) {
  const messages = buildChoiceMessages(question, options, profile);
  const result = await groqChat({
    apiKey,
    model: CHOICE_MODEL,
    messages,
    maxTokens: 200
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
