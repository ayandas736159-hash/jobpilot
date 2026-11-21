import { parseResume } from "./ats.js";
import { MODELS } from "./models.js";
import { profileCorpus } from "./profile.js";
import { groqChat } from "./groq.js";

export const TAILOR_MODEL = MODELS.cheap.id;

const TOOLS = ["salesforce", "outreach.io", "salesloft", "gong", "chorus", "apollo", "hubspot", "dripify", "snov", "zoominfo", "gainsight", "zendesk", "intercom", "marketo", "pardot", "amplemarket", "orum", "koncert", "clay.com", "outreach"];

function numbersOf(text) {
  return String(text || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/g) || [];
}

function hasNewTool(text, source) {
  const hay = source.toLowerCase();
  const needle = text.toLowerCase();
  return TOOLS.some((tool) => needle.includes(tool) && !hay.includes(tool));
}

export function parseJsonObject(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON. Try again.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The model returned JSON that could not be read. Try again.");
  }
}

export function resumePack(profile) {
  const parsed = parseResume(profile.resumeText || "");
  return {
    name: parsed.name,
    headline: parsed.headline,
    contacts: parsed.contacts,
    summary: parsed.summary,
    skills: parsed.skills,
    experience: parsed.experience,
    projects: parsed.projects,
    education: parsed.education,
    leadership: parsed.leadership
  };
}

export function tailorMessages(pack, jd) {
  const brief = {
    headline: pack.headline,
    summary: pack.summary,
    skills: pack.skills,
    experience: (pack.experience || []).map((entry) => ({
      company: entry.company,
      title: entry.title,
      dates: entry.dates,
      sub: entry.sub,
      bullets: entry.bullets
    })),
    projects: (pack.projects || []).map((entry) => ({
      company: entry.company,
      title: entry.title,
      dates: entry.dates,
      bullets: entry.bullets
    }))
  };
  return [
    {
      role: "system",
      content: "Return one JSON object only. Rephrase and reorder the resume for the job. Never add an employer, title, date, number, tool, or degree that is not already in the resume. Put missing requirements in gaps instead of the resume."
    },
    {
      role: "user",
      content: `JSON keys: headline, summary, skills (array of {category, items}), experience (array of {bullets} in the same order and length as the resume), projects (same), gaps (array of short strings), changes (array of short strings).
Keep every company, title, and date. You may reword a bullet only with facts already in that bullet.
RESUME:
${JSON.stringify(brief)}
JOB:
${String(jd || "").replace(/\s+/g, " ").trim().slice(0, 1800)}`
    }
  ];
}

export function assembleTailored(pack, llm, sourceText) {
  const allowed = new Set(numbersOf(sourceText));
  const notes = [];
  const source = sourceText.toLowerCase();
  function bullet(next, original) {
    const text = String(next || "").trim();
    if (!text) return original;
    if (numbersOf(text).some((num) => !allowed.has(num)) || hasNewTool(text, sourceText)) {
      notes.push("Kept an original bullet because the rewrite added a number or tool that is not in the profile.");
      return original;
    }
    return text;
  }
  function rewriteEntries(originals, incoming) {
    return (originals || []).map((entry, index) => {
      const fromModel = (incoming || [])[index] || {};
      const bullets = (entry.bullets || []).map((item, bulletIndex) => bullet((fromModel.bullets || [])[bulletIndex], item));
      return { ...entry, bullets };
    });
  }
  let summary = String(llm.summary || "").trim();
  if (!summary || numbersOf(summary).some((num) => !allowed.has(num)) || hasNewTool(summary, sourceText)) {
    if (summary) notes.push("Kept the original summary because the rewrite added a new number or tool.");
    summary = pack.summary;
  }
  const wantedSkills = [];
  (llm.skills || []).forEach((row) => {
    (row.items || []).forEach((item) => {
      const text = String(item || "").trim();
      if (text && source.includes(text.toLowerCase())) wantedSkills.push(text);
    });
  });
  const skills = (pack.skills || []).map((row) => {
    const items = [...(row.items || [])];
    items.sort((a, b) => {
      const ai = wantedSkills.findIndex((item) => item.toLowerCase() === a.toLowerCase());
      const bi = wantedSkills.findIndex((item) => item.toLowerCase() === b.toLowerCase());
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    return { category: row.category, items };
  });
  let headline = String(llm.headline || "").trim();
  if (!headline || numbersOf(headline).some((num) => !allowed.has(num)) || hasNewTool(headline, sourceText)) headline = pack.headline;
  const gaps = [...new Set((llm.gaps || []).map((gap) => String(gap || "").trim()).filter(Boolean))]
    .filter((gap) => !source.includes(gap.toLowerCase()))
    .slice(0, 8);
  const changes = [...new Set([...(llm.changes || []).map((item) => String(item || "").trim()).filter(Boolean), ...notes])].slice(0, 8);
  return {
    model: {
      name: pack.name,
      headline,
      contacts: pack.contacts,
      summary,
      skills,
      experience: rewriteEntries(pack.experience, llm.experience),
      projects: rewriteEntries(pack.projects, llm.projects),
      education: pack.education,
      leadership: pack.leadership
    },
    gaps,
    changes
  };
}

export async function tailorWithGroq({ apiKey, profile, jd }) {
  const pack = resumePack(profile);
  const sourceText = profileCorpus(profile);
  const messages = tailorMessages(pack, jd);
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await groqChat({ apiKey, model: TAILOR_MODEL, messages, maxTokens: 1800 });
      const llm = parseJsonObject(result.text);
      return { ...assembleTailored(pack, llm, sourceText), tokens: result.tokens, modelId: TAILOR_MODEL };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Tailoring failed. Try again.");
}
