/** Rough token estimate. Groq usage totals replace this after a call. */
export function estimateTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

export function estimateMessages(messages) {
  const chars = (messages || []).reduce((sum, message) => sum + String(message.content || "").length + 8, 0);
  return Math.ceil(chars / 4);
}

export function wordCount(text) {
  const words = String(text || "").trim().match(/\S+/g);
  return words ? words.length : 0;
}
