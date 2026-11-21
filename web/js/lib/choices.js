import { hasPhrase } from "./ats.js";
import { profileCorpus, readFacts } from "./profile.js";

function optionScale(label) {
  const text = label.toLowerCase();
  if (/out of\s*10|10-point|\/\s*10|cgpa[^.]{0,20}10/.test(text)) return 10;
  if (/out of\s*4|4-point|\/\s*4|cgpa[^.]{0,12}4/.test(text)) return 4;
  if (/percent/.test(text)) return "percent";
  if (/^other\b/.test(text.trim())) return "other";
  return null;
}

function optionTheme(label) {
  const text = label.toLowerCase();
  if (/^(no\b|have not|haven't|did not|i have not)/.test(text.trim()) || text.trim() === "no") return "no";
  if (/cyber|grc|it audit|information security/.test(text)) return "security";
  if (/customer-facing|customer facing|implementation|project role/.test(text)) return "customer";
  if (/another field|other field|different field/.test(text)) return "other";
  return "unknown";
}

export function parseRange(label) {
  const text = String(label || "").toLowerCase().replace(/[–—]/g, "-");
  let match = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (match) return { min: Number(match[1]), max: Number(match[2]) };
  match = text.match(/(?:below|under|less than|<)\s*(\d+(?:\.\d+)?)/);
  if (match) return { min: -Infinity, max: Number(match[1]), exclusiveMax: true };
  match = text.match(/(\d+(?:\.\d+)?)\s*(?:\+|or above|and above|or higher|or more)/);
  if (match) return { min: Number(match[1]), max: Infinity };
  return null;
}

function contains(value, range) {
  if (value < range.min) return false;
  if (range.exclusiveMax) return value < range.max;
  return value <= range.max;
}

function result(index, labels, extra) {
  return {
    index,
    label: index >= 0 ? labels[index] : "",
    confidence: extra.confidence,
    source: extra.source,
    reason: extra.reason
  };
}

function pickScale(labels, facts) {
  const scales = labels.map(optionScale);
  let index = -1;
  if (facts.cgpaScale === 10) index = scales.indexOf(10);
  else if (facts.cgpaScale === 4) index = scales.indexOf(4);
  if (index >= 0) {
    return result(index, labels, {
      confidence: 0.96,
      source: "rule",
      reason: `Resume lists CGPA ${facts.cgpa}/${facts.cgpaScale}.`
    });
  }
  return result(-1, labels, {
    confidence: 0,
    source: "none",
    reason: "The resume does not state a grading scale, so no option was selected."
  });
}

function pickRange(labels, facts) {
  if (facts.cgpa == null) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: "No CGPA was found in the resume."
    });
  }
  const hits = [];
  labels.forEach((label, index) => {
    const range = parseRange(label);
    if (!range || !contains(facts.cgpa, range)) return;
    const width = (range.max === Infinity ? range.min + 20 : range.max) - (range.min === -Infinity ? 0 : range.min);
    hits.push({ index, width });
  });
  if (!hits.length) {
    return result(-1, labels, {
      confidence: 0.35,
      source: "needs-model",
      reason: `No bucket clearly contains ${facts.cgpa}.`
    });
  }
  hits.sort((a, b) => a.width - b.width);
  return result(hits[0].index, labels, {
    confidence: 0.95,
    source: "rule",
    reason: `CGPA ${facts.cgpa} falls in this range.`
  });
}

function pickInternship(labels, facts) {
  const themes = labels.map(optionTheme);
  let index = -1;
  let reason = "";
  if (!facts.hasInternship) {
    index = themes.indexOf("no");
    reason = "No internship or trainee role is in the profile.";
  } else if (!facts.security && (facts.customerFacing || facts.implementation)) {
    index = themes.indexOf("customer");
    reason = "The resume shows customer-facing and project internships, not cybersecurity or IT audit.";
    if (index < 0) {
      index = themes.indexOf("other");
      reason = "Internship experience is listed, and the customer-facing option was not offered.";
    }
  } else if (facts.security && !facts.customerFacing) {
    index = themes.indexOf("security");
    reason = "The resume mentions security or audit work.";
  } else if (facts.hasInternship) {
    index = themes.indexOf("other");
    reason = "An internship is listed, but the field is unclear.";
  }
  if (index >= 0 && themes[index] === "security" && !facts.security) index = -1;
  if (index >= 0) {
    return result(index, labels, { confidence: 0.92, source: "rule", reason });
  }
  return result(-1, labels, {
    confidence: 0.4,
    source: "needs-model",
    reason: "The internship options did not match a profile rule."
  });
}

function overlapScore(label, profile) {
  const text = label.trim();
  if (text.length < 3 || /^(none|other|n\/a|not sure|select)$/i.test(text)) return 0;
  const corpus = profileCorpus(profile);
  let score = 0;
  if (hasPhrase(corpus, text)) score += 4;
  const fields = [profile.noticePeriod, profile.workAuthorization, profile.location, profile.expectedSalary, profile.links];
  fields.forEach((field) => {
    if (field && hasPhrase(field, text)) score += 5;
    if (field && hasPhrase(text, field)) score += 5;
  });
  return score;
}

function pickByOverlap(labels, profile) {
  const scored = labels.map((label, index) => ({ index, label, score: overlapScore(label, profile) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  if (!top || top.score <= 0) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: "No option matches a fact in the profile."
    });
  }
  if (second && second.score > 0 && top.score - second.score < 1) {
    return result(-1, labels, {
      confidence: 0.45,
      source: "needs-model",
      reason: "More than one option matches the profile."
    });
  }
  return result(top.index, labels, {
    confidence: 0.84,
    source: "rule",
    reason: "The option matches text in the profile."
  });
}

function looksLikeScale(question, labels) {
  const q = question.toLowerCase();
  const scaleOptions = labels.filter((label) => optionScale(label)).length;
  return scaleOptions >= 2 && (/report this result|grading|how does your college|cgpa or percentage|gpa scale/.test(q) || /college|cgpa|gpa|grade/.test(q));
}

function looksLikeRange(question, labels) {
  const q = question.toLowerCase();
  const ranges = labels.filter((label) => parseRange(label)).length;
  return ranges >= 2 && /score fall|cgpa|gpa|grade|10-point|point scale|range/.test(q);
}

function looksLikeInternship(question) {
  return /completed an internship|have you.{0,40}intern|internship experience/.test(question.toLowerCase());
}

function looksLikeQualification(question) {
  return /qualification|degree|field of study|what did you study/.test(question.toLowerCase());
}

function scoreQualification(label, facts) {
  const text = label.toLowerCase();
  const corpus = facts.corpus || "";
  const isCse = /computer science|\bcse\b/i.test(corpus) || /cse/i.test(facts.degree || "");
  const isBtech = /b\.?\s*tech|bachelor/i.test(corpus);
  let score = 0;
  if (/b\.?\s*tech|bachelor|b\.e\b/.test(text) && isBtech) score += 2;
  if (/\bcse\b|computer|information technology|\bit\b|ai\/ml|artificial intelligence/.test(text) && isCse) score += 4;
  if (/cyber/.test(text) && !facts.security) score -= 3;
  if (/\bmba\b|m\.?\s*tech|commerce|arts|design/.test(text) && !/\bmba\b|m\.?\s*tech/i.test(corpus)) score -= 3;
  if (/^other\b/.test(text.trim())) score -= 1;
  return score;
}

function pickQualification(labels, facts) {
  if (!facts.degree) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: "No degree is listed in the resume, so this stays blank."
    });
  }
  let best = -1;
  let bestScore = 0;
  labels.forEach((label, index) => {
    const score = scoreQualification(label, facts);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  if (best < 0 || bestScore < 4) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: `Resume lists ${facts.degree}, and none of these options say that.`
    });
  }
  const year = facts.graduationYear ? `, graduating ${facts.graduationYear}` : "";
  return result(best, labels, {
    confidence: 0.95,
    source: "rule",
    reason: `Resume lists ${facts.degree}${year}.`
  });
}

function yearSpan(label) {
  const text = label.toLowerCase().replace(/[–—]/g, "-");
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (!years.length) return null;
  if (/or later|or after|and later/.test(text)) return { min: years[0], max: 9999 };
  if (/or earlier|or before|and earlier/.test(text)) return { min: 0, max: years[0] };
  if (years.length >= 2) return { min: Math.min(...years), max: Math.max(...years) };
  return { min: years[0], max: years[0] };
}

function looksLikeGraduation(question) {
  return /when do you graduate|when will you graduate|graduation year|year of graduation|graduating in/.test(question.toLowerCase());
}

function pickGraduation(labels, facts) {
  if (!facts.graduationYear) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: "No graduation year is listed in the resume, so this stays blank."
    });
  }
  const hits = [];
  labels.forEach((label, index) => {
    const span = yearSpan(label);
    if (!span || facts.graduationYear < span.min || facts.graduationYear > span.max) return;
    hits.push({ index, width: span.max - span.min });
  });
  if (!hits.length) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: `Resume lists graduation in ${facts.graduationYear}, and none of these options include that year.`
    });
  }
  hits.sort((a, b) => a.width - b.width);
  return result(hits[0].index, labels, {
    confidence: 0.97,
    source: "rule",
    reason: `Education dates end in ${facts.graduationYear}.`
  });
}

function looksLikeStart(question) {
  return /how soon|when can you (start|join)|could you join|notice period/.test(question.toLowerCase());
}

function pickStart(labels, profile) {
  if (!String(profile.noticePeriod || "").trim()) {
    return result(-1, labels, {
      confidence: 0,
      source: "none",
      reason: "Notice period is blank in the profile, so this stays unset."
    });
  }
  return pickByOverlap(labels, profile);
}

/**
 * Pick one option from profile rules.
 * source "needs-model" means a short Groq call is justified.
 * source "none" means leave the question blank.
 */
export function chooseOption(question, options, profile) {
  const labels = options.map((option) => (typeof option === "string" ? option : option.label));
  const facts = readFacts(profile || {});
  if (looksLikeScale(question, labels)) return pickScale(labels, facts);
  if (looksLikeRange(question, labels)) return pickRange(labels, facts);
  if (looksLikeInternship(question)) return pickInternship(labels, facts);
  if (looksLikeQualification(question)) return pickQualification(labels, facts);
  if (looksLikeGraduation(question)) return pickGraduation(labels, facts);
  if (looksLikeStart(question)) return pickStart(labels, profile || {});
  return pickByOverlap(labels, profile || {});
}

/** Checkboxes: select every option the resume actually names. No model call. */
export function chooseChecks(question, options, profile) {
  const labels = options.map((option) => (typeof option === "string" ? option : option.label));
  const corpus = profileCorpus(profile || {});
  const indices = [];
  labels.forEach((label, index) => {
    const text = label.trim();
    if (text.length < 3 || /^(none|other|n\/a|not sure)$/i.test(text)) return;
    if (hasPhrase(corpus, text)) indices.push(index);
  });
  return {
    indices,
    source: "rule",
    reason: indices.length
      ? "Checked only the options named in the resume."
      : "None of these options appear in the resume."
  };
}
