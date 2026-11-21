import { DEFAULT_RESUME } from "./ats.js";

/** Facts copied from the resume. SoluLab is stored in full so answers can use real numbers. */
export const DEFAULT_STORIES = [
  {
    id: "solulab",
    role: "SoluLab — B2B Growth Hacker Trainee (Remote), Aug 2026 – Sep 2026",
    facts: [
      "Launched and tracked 4 LinkedIn outbound campaigns in Dripify for Coverline (US E&S brokers and MGAs), reaching ~760 Sales Navigator-sourced leads.",
      "Ran a Snov.io email campaign to ~205 E&S contacts and drafted MGA email copy, refining messaging with manager feedback and prospect replies.",
      "Built ~1,370 additional leads across 3 new verticals (Real Estate, F&B, and QSR) and wrote multi-step Dripify sequences with calendar-booking CTAs.",
      "Maintained a reply-tracking sheet for message stages and follow-ups.",
      "Helped map an 85-organisation US and Canada MGA universe."
    ]
  },
  {
    id: "pepsico",
    role: "PepsiCo — Pep Sales Star Intern, Business Development, Jun 2025 – Jul 2025",
    facts: [
      "Ran retail market research, competitor analysis, and field audits.",
      "Shared findings with the sales and marketing teams."
    ]
  },
  {
    id: "celebal",
    role: "Celebal Technologies — Power BI Analytics Summer Intern, Jun 2025 – Aug 2025",
    facts: [
      "Built 25+ Power BI dashboards.",
      "One dashboard flagged 213 unassigned customer portfolios to support account ownership tracking."
    ]
  },
  {
    id: "extern",
    role: "Extern — Amazon Fulfillment Center Case, Operational Strategy and People Analytics Intern, Jul 2025 – Sep 2025",
    facts: [
      "Analysed turnover data and employee feedback with Python, Pandas, and SQL to find operational bottlenecks and recommend workforce improvements."
    ]
  },
  {
    id: "apogee",
    role: "APOGEE, BITS Pilani — Marketing Intern, Jan 2025 – Mar 2025",
    facts: [
      "Ran multi-channel outreach campaigns promoting a national technology festival to a network of 1,000+ students."
    ]
  },
  {
    id: "foundertruth",
    role: "Foundertruth — Founder, Feb 2026 – Present",
    facts: [
      "Built Foundertruth, a B2B SaaS that helps incubators and accelerators run programmes, applications, mentoring, and sponsor reporting.",
      "Prospected and pitched Foundertruth to 70+ incubators and accelerators through personalised email outreach in HubSpot, mapping their workflows and pain points.",
      "Incubated at GIEC and set up the incubator's account and first cohort on the platform.",
      "An earlier founder-facing version reached 160+ registered users and 2.9K+ page views.",
      "Led a 4-person team (3 early contributors and 1 paid intern), brought in a senior developer, and launched on about ₹15–20K.",
      "Shipped Mike, an AI coach that answers questions by citing founders' own records."
    ]
  }
];

export function defaultProfile() {
  return {
    name: "Padmanava Das",
    email: "padmanavadas026@gmail.com",
    phone: "+91-7586903918",
    linkedin: "https://www.linkedin.com/in/padmanavadas",
    portfolio: "https://padmanava.space",
    location: "Cooch Behar, West Bengal, India",
    workAuthorization: "",
    noticePeriod: "",
    expectedSalary: "",
    links: "https://foundertruth.in",
    resumeText: DEFAULT_RESUME,
    stories: DEFAULT_STORIES.map((story) => ({
      id: story.id,
      role: story.role,
      facts: story.facts.slice()
    }))
  };
}

export function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

export function storyText(story) {
  const facts = Array.isArray(story.facts)
    ? story.facts.join(" ")
    : String(story.facts || "");
  return `${story.role || ""} ${facts}`.trim();
}

export function profileCorpus(profile) {
  const stories = (profile.stories || []).map(storyText).join("\n");
  return [
    profile.name,
    profile.email,
    profile.phone,
    profile.linkedin,
    profile.portfolio,
    profile.location,
    profile.workAuthorization,
    profile.noticePeriod,
    profile.expectedSalary,
    profile.links,
    profile.resumeText,
    stories
  ].filter(Boolean).join("\n");
}

/** Numbers and education pulled from the resume text, not guessed. */
export function readFacts(profile) {
  const resume = String(profile.resumeText || "");
  const corpus = profileCorpus(profile);
  const cgpaMatch = resume.match(/cgpa\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  return {
    cgpa: cgpaMatch ? Number(cgpaMatch[1]) : null,
    cgpaScale: cgpaMatch ? Number(cgpaMatch[2]) : null,
    hasInternship: /\bintern(ship)?\b|\btrainee\b/i.test(corpus),
    security: /\b(cybersecurity|cyber security|\bsoc\b|\bgrc\b|it audit|information security)\b/i.test(corpus),
    customerFacing: /\b(customer|sales|business development|\bb2b\b|outreach|growth hacker|retail)\b/i.test(corpus),
    implementation: /\b(implement|built|shipped|dashboard|product|python)\b/i.test(corpus),
    corpus
  };
}

export function valueForPurpose(purpose, profile) {
  const { firstName, lastName } = splitName(profile.name);
  const facts = readFacts(profile);
  const map = {
    firstName,
    lastName,
    fullName: profile.name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    linkedin: profile.linkedin || "",
    portfolio: profile.portfolio || "",
    website: profile.portfolio || profile.links || "",
    location: profile.location || "",
    city: profile.location || "",
    workAuthorization: profile.workAuthorization || "",
    noticePeriod: profile.noticePeriod || "",
    salary: profile.expectedSalary || "",
    links: profile.links || "",
    cgpa: facts.cgpa == null ? "" : String(facts.cgpa)
  };
  return map[purpose] || "";
}
