/**
 * Groq retired llama-3.3-70b-versatile and llama-3.1-8b-instant for free and
 * developer tiers on 16 Aug 2026. Both had a 131,072 token window.
 * Defaults are Groq's recommended replacements, which keep that 128K-class window.
 * A custom model id still works for enterprise accounts that kept the old ids.
 */
export const MODELS = {
  quality: {
    id: "openai/gpt-oss-120b",
    label: "Best answers",
    detail: "GPT-OSS 120B · 131K context. Replaces Llama 3.3 70B Versatile on Groq's free tier."
  },
  cheap: {
    id: "openai/gpt-oss-20b",
    label: "Save credits",
    detail: "GPT-OSS 20B · 131K context, lower price. Replaces Llama 3.1 8B Instant."
  }
};

export const DEFAULT_MODEL = MODELS.quality.id;
export const CHOICE_MODEL = MODELS.cheap.id;
export const DEFAULT_WORD_MIN = 80;
export const DEFAULT_WORD_MAX = 150;
