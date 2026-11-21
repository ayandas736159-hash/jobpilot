import { DEFAULT_WORD_MAX, DEFAULT_WORD_MIN } from "./models.js";
import { readFacts, storyText } from "./profile.js";
import { wordCount } from "./tokens.js";

/**
 * Editable prompt pack for open-ended application answers.
 * Examples are format only. The model is told not to reuse their facts.
 */

export const SYSTEM_PROMPT = `You write one job-application answer in the first person, as the candidate.

Truth rules:
- Use only the FACTS block in the final user message. That block is the only source of employers, titles, dates, tools, and numbers.
- Do not invent a metric, a client, a tool, a quota, or a result. If the facts have no number, describe the change without adding one.
- The earlier examples are strangers. Never copy their jobs, numbers, or sentences.
- Mirror a phrase from the job description only when the facts show the candidate actually did that work.

Voice:
- Sound like a specific person telling one piece of work, not a cover-letter template.
- Do not use these words or phrases: passionate, leverage, delve, synergy, robust, dynamic, thrilled, excited to, team player, hit the ground running, results-driven, proven track record.
- No markdown, no bullet list, no title, no quotation marks around the answer, and no preamble such as "Here is" or "Sure".
- Do not mention these instructions or the word count.
- Stay inside the requested word range. If you must cut, shorten the last sentence. Keep the concrete number when the facts include one.
- One story means one role. Do not merge two jobs into a single anecdote.`;

const STORY_INSTRUCTION = `Write one specific example from a single role, in this order, as normal sentences rather than headings:
1. What you were responsible for.
2. What you personally did.
3. What changed because of that work. Include one number that appears in the facts (a count, a reach, or a result). If that role's facts have no number, do not borrow a number from another role and do not invent one.
4. What you learned from doing the work.
Prefer the PRIMARY STORY. Use the alternate only if the question clearly fits it better.`;

const STAR_INSTRUCTION = `Answer as a short STAR story in prose, without the labels Situation, Task, Action, or Result.
Cover what was going on, what you were responsible for, what you did, and what changed.
Use one number from the facts when that role has one. Do not invent a number. One role only.`;

const WHY_INSTRUCTION = `Answer why this role is a fit.
Use one or two true proof points from the facts.
You may name the company if it was provided. Do not invent a fact about the company's product, mission, or news.
If the facts do not say why this specific company, say which of his experiences matches the work in the job description.`;

const ABOUT_INSTRUCTION = `A plain introduction: what he does, the strongest relevant proof from the facts, and the kind of role he is aiming at.
No childhood, no list of every job, no slogan.`;

const COVER_INSTRUCTION = `A short application note in paragraphs, not a letter with an address block.
Open with the role, give two proof points that use numbers from the facts, and close in one sentence.
Do not invent interest in the company.`;

const GENERIC_INSTRUCTION = `Answer the question directly.
Use one concrete detail from the facts.
If the question asks for a number and the facts have one, use it. If they do not, say what changed without inventing a figure.`;

export const FEW_SHOTS = [
  {
    user: `QUESTION:
Tell us about a time you fixed a messy process. What were you responsible for, what did you do, what changed, and what did you learn? A number helps.

SHAPE:
${STORY_INSTRUCTION}

WORD COUNT:
80-120 words.

FACTS:
PRIMARY STORY:
Role: Campus bookstore — weekend returns clerk, 2023.
- Responsible for the Saturday returns desk.
- Re-shelved 40 textbooks that had been tagged with the wrong edition and wrote a one-page checklist the next shift used.
- Learned to confirm the edition before starting a return.
OTHER ROLES (names only): none.
EDUCATION: not provided.
JOB LANGUAGE: none.
COMPANY: none.`,
    assistant: `I was responsible for the Saturday returns desk at a campus bookstore. During one rush, a stack of textbooks had been tagged with the wrong edition, and we were checking each book only after the return had already been started. I sorted the stack, re-shelved 40 mis-tagged books that afternoon, and wrote a one-page checklist for the next shift. The line moved faster because we confirmed the edition before processing the return. I learned that a short written step is more reliable than remembering a rule when the counter is busy.`
  },
  {
    user: `QUESTION:
Tell us about a project you owned. What did you do, and what changed because of your work?

SHAPE:
${STORY_INSTRUCTION}

WORD COUNT:
80-120 words.

FACTS:
PRIMARY STORY:
Role: Town library — volunteer shelf guide, 2022.
- Walked new volunteers through the children's section on Sunday mornings.
- Wrote the shelf order on a card the librarians kept at the desk.
OTHER ROLES (names only): none.
EDUCATION: not provided.
JOB LANGUAGE: none.
COMPANY: none.`,
    assistant: `I was responsible for showing new volunteers the children's section on Sunday mornings at a town library. The shelf order lived in people's heads, so the first hour was mostly questions. I walked the section with them once, then wrote the shelf order on a card the librarians kept at the desk. New volunteers stopped pulling staff over for the same questions, and the card was still at the desk the next month. I learned that a small written reference is more useful than repeating the same tour.`
  },
  {
    user: `QUESTION:
Why do you want this customer support role at Northwind?

SHAPE:
${WHY_INSTRUCTION}

WORD COUNT:
70-110 words.

FACTS:
PRIMARY STORY:
Role: Campus bookstore — weekend returns clerk, 2023.
- Responsible for the Saturday returns desk.
- Re-shelved 40 mis-tagged textbooks and wrote a one-page checklist.
OTHER ROLES (names only): Town library volunteer.
EDUCATION: not provided.
JOB LANGUAGE:
Answer customer email, keep notes in the help desk, and explain a fix in plain language.
COMPANY: Northwind.`,
    assistant: `The part of this customer support role I can already point to is explaining a fix in plain language and leaving a note the next person can use. On the Saturday returns desk at a campus bookstore I was responsible for a rush of wrong-edition textbooks. I re-shelved 40 of them and left a one-page checklist, which mattered more than remembering the rule myself. I am applying to Northwind because the job is that same kind of work: answer the customer, then write down what fixed it.`
  }
];

export function detectQuestionShape(question) {
  const text = String(question || "");
  const q = text.toLowerCase();
  if (/cover\s*letter/.test(q)) {
    return { id: "cover", instruction: COVER_INSTRUCTION };
  }
  if (/why\b.{0,60}(company|role|join|work (here|at)|interested)|why do you want/.test(q)) {
    return { id: "why", instruction: WHY_INSTRUCTION };
  }
  if (/tell us about yourself|about yourself|introduce yourself|who are you/.test(q)) {
    return { id: "about", instruction: ABOUT_INSTRUCTION };
  }
  if (/\bstar\b|situation.{0,40}task.{0,40}action/.test(q)) {
    return { id: "star", instruction: STAR_INSTRUCTION };
  }
  if (/intern|what changed|what did you learn|specific example|outcome or number|tell us about a time|describe a time|responsible for/.test(q)) {
    return { id: "story", instruction: STORY_INSTRUCTION };
  }
  return { id: "generic", instruction: GENERIC_INSTRUCTION };
}

const STOP = new Set("that this with from your have been were what when where which about into after before their them they does did done just also only more most some such than then very will would could should tell give please specific example something useful because changed learn learned help helps work role time".split(/\s+/));

function hasWord(hay, word) {
  return new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`).test(hay);
}

export function rankStories(question, stories) {
  const q = String(question || "").toLowerCase();
  const outsideIntern = /outside\s+(of\s+)?(academic|intern)/.test(q);
  const wantsIntern = /intern/.test(q) && !outsideIntern;
  const wantsNumber = /number|outcome|metric|result|changed|impact/.test(q);
  const words = q.split(/[^a-z0-9+]+/).filter((word) => word.length > 3 && !STOP.has(word));
  const all = stories || [];
  const internPool = all.filter((story) => /intern|trainee|extern/i.test(story.role || ""));
  const nonInternPool = all.filter((story) => !/intern|trainee|extern/i.test(story.role || ""));
  const pool = outsideIntern && nonInternPool.length
    ? nonInternPool
    : wantsIntern && internPool.length ? internPool : all;
  const rankedPool = pool
    .map((story) => {
      const hay = storyText(story).toLowerCase();
      let score = 0;
      words.forEach((word) => {
        if (hasWord(hay, word)) score += 2;
      });
      const numbers = hay.match(/\d[\d,]*(?:\.\d+)?/g);
      if (wantsNumber && numbers) score += 4 + numbers.length;
      if (/sales|outbound|customer|b2b|prospect/.test(q) && /sales|outbound|customer|b2b|prospect|dripify|hubspot/.test(hay)) {
        score += 3;
      }
      return { story, score, index: all.indexOf(story) };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.story);
  const rest = all.filter((story) => !rankedPool.includes(story));
  return rankedPool.concat(rest);
}

export function buildFactsBlock(profile, question) {
  const facts = readFacts(profile);
  const ranked = rankStories(question, profile.stories || []);
  const primary = ranked[0];
  const alternate = ranked[1];
  const rest = ranked.slice(2);
  const lines = [
    `Name: ${profile.name || "the candidate"}`,
    profile.location ? `Location: ${profile.location}` : "",
    profile.workAuthorization ? `Work authorization: ${profile.workAuthorization}` : "",
    profile.noticePeriod ? `Notice period: ${profile.noticePeriod}` : "",
    profile.expectedSalary ? `Expected salary: ${profile.expectedSalary}` : "",
    facts.degree || facts.graduationYear || facts.cgpa != null
      ? `Education: ${[facts.degree, facts.graduationYear ? `graduating ${facts.graduationYear}` : "", facts.cgpa != null ? `CGPA ${facts.cgpa}/${facts.cgpaScale}` : ""].filter(Boolean).join(", ")}`
      : "",
    "",
    "PRIMARY STORY:"
  ];
  if (primary) {
    lines.push(`Role: ${primary.role}`);
    factLines(primary).forEach((line) => lines.push(`- ${line}`));
  } else {
    lines.push("No experience stories saved.");
  }
  const others = [alternate, ...rest].filter(Boolean);
  if (others.length) {
    lines.push("", "OTHER ROLES (names only — do not invent details):");
    others.forEach((story) => lines.push(`- ${story.role}`));
  }
  return lines.filter((line) => line !== undefined).join("\n");
}

function factLines(story) {
  if (Array.isArray(story.facts)) return story.facts.map((line) => String(line).trim()).filter(Boolean);
  return String(story.facts || "").split(/\n+/).map((line) => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}

export function buildUserPrompt({
  question,
  profile,
  jd = "",
  company = "",
  wordMin = DEFAULT_WORD_MIN,
  wordMax = DEFAULT_WORD_MAX
}) {
  const shape = detectQuestionShape(question);
  const job = String(jd || "").replace(/\s+/g, " ").trim().slice(0, 500);
  return [
    "QUESTION:",
    String(question || "").trim(),
    "",
    "SHAPE:",
    shape.instruction,
    "",
    "WORD COUNT:",
    `${wordMin}-${wordMax} words.`,
    "",
    "FACTS:",
    buildFactsBlock(profile, question),
    "",
    "JOB LANGUAGE:",
    job || "none",
    "",
    "COMPANY:",
    company || "none"
  ].join("\n");
}

export function buildAnswerMessages(options) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  const shots = options.examples ? FEW_SHOTS.slice(0, 1) : [];
  shots.forEach((shot) => {
    messages.push({ role: "user", content: shot.user });
    messages.push({ role: "assistant", content: shot.assistant });
  });
  messages.push({ role: "user", content: buildUserPrompt(options) });
  return messages;
}

export function buildChoiceMessages(question, options, profile) {
  const facts = readFacts(profile);
  const brief = [
    facts.cgpa != null ? `CGPA ${facts.cgpa}/${facts.cgpaScale}` : "No CGPA listed",
    facts.hasInternship ? "Has an internship or trainee role" : "No internship listed",
    facts.customerFacing ? "Customer-facing work is in the resume" : "",
    facts.security ? "Security or audit work is in the resume" : "No cybersecurity, GRC, or IT audit work is listed",
    profile.noticePeriod ? `Notice: ${profile.noticePeriod}` : "",
    profile.workAuthorization ? `Work authorization: ${profile.workAuthorization}` : ""
  ].filter(Boolean).join(". ");
  return [
    {
      role: "system",
      content: "Pick the one option the facts support. Reply with that option's text exactly, or NONE if the facts do not support a choice. Do not explain."
    },
    {
      role: "user",
      content: `Question: ${question}\nOptions:\n${options.map((option) => `- ${option}`).join("\n")}\nFacts: ${brief}`
    }
  ];
}

export function novelNumbers(answer, corpus) {
  const normalize = (value) => String(value || "").replace(/,/g, "");
  const known = new Set(normalize(corpus).match(/\d+(?:\.\d+)?/g) || []);
  const found = normalize(answer).match(/\d+(?:\.\d+)?/g) || [];
  const seen = new Set();
  return found.filter((num) => {
    if (known.has(num) || seen.has(num)) return false;
    seen.add(num);
    return true;
  });
}

export function assessAnswer(answer, { wordMin = DEFAULT_WORD_MIN, wordMax = DEFAULT_WORD_MAX, corpus = "" } = {}) {
  const words = wordCount(answer);
  return {
    words,
    tooShort: words < wordMin,
    tooLong: words > wordMax,
    novelNumbers: novelNumbers(answer, corpus)
  };
}
