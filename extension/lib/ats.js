/**
 * Keyword match, resume parse, and tailor.
 * Ported from the local ATS Resume Tailor. Reorders real bullets and skills.
 * Does not invent jobs, tools, or numbers.
 */
const ATS = (() => {
  "use strict";

  "use strict";

  const DEFAULT_RESUME = `PADMANAVA DAS
Sales Development | Customer Success | Technical Account Management
Cooch Behar, West Bengal, India | +91-7586903918
padmanavadas026@gmail.com | linkedin.com/in/padmanavadas | padmanava.space

SUMMARY
Customer-facing B.Tech CSE graduate (2026) who built Foundertruth, a B2B SaaS for incubators and accelerators, and pitched it to 70+ of them. Adds B2B outbound experience at SoluLab and a technical (CSE) edge.

CORE SKILLS
Sales & Prospecting: B2B Outreach, HubSpot, Dripify, Snov.io, Email Deliverability, ICP & Account Research, LinkedIn Sales Navigator, Personalised Outreach, Lead Qualification, Pipeline Development
Customer Success: Customer Discovery & Interviews, Stakeholder Communication, Feedback to Product, Team Leadership
Technical: SaaS Products, HTML, CSS, JavaScript, React.js, SQL, Python, Excel, Power BI, Google Analytics, Generative AI (ChatGPT, Gemini)

EXPERIENCE
Foundertruth (foundertruth.in) | Founder — Feb 2026 – Present
B2B SaaS that helps incubators and accelerators run programmes, applications, mentoring and sponsor reporting
• Prospected and pitched Foundertruth to 70+ incubators and accelerators through personalised email outreach (HubSpot), mapping their workflows and pain points.
• Incubated at GIEC; set up the incubator's account and first cohort on the platform.
• Earlier founder-facing version reached 160+ registered users and 2.9K+ page views.
• Led a 4-person team (3 early contributors, 1 paid intern), brought in a senior developer, and launched on ~₹15–20K.
• Product covers programme pages and application forms, team applicant review, mentors, tasks and meetings, needs-attention flags, analytics, and Excel/PDF sponsor reports.
• Shipped "Mike", an AI coach that answers questions by citing founders' own records.

SoluLab | B2B Growth Hacker Trainee (Remote) — Aug 2026 – Sep 2026
• Launched and tracked 4 LinkedIn outbound campaigns in Dripify for Coverline (US E&S brokers and MGAs), reaching ~760 Sales Navigator-sourced leads.
• Ran a Snov.io email campaign to ~205 E&S contacts and drafted MGA email copy, refining messaging with manager feedback and prospect replies.
• Built ~1,370 additional leads across 3 new verticals (Real Estate, F&B, QSR) and wrote multi-step Dripify sequences with calendar-booking CTAs.
• Maintained a reply-tracking sheet for message stages and follow-ups; helped map an 85-organisation US & Canada MGA universe.

PepsiCo | Pep Sales Star Intern, Business Development — Jun 2025 – Jul 2025
• Ran retail market research, competitor analysis and field audits; shared findings with sales and marketing teams.

Celebal Technologies | Power BI Analytics Summer Intern — Jun 2025 – Aug 2025
• Built 25+ Power BI dashboards; one flagged 213 unassigned customer portfolios to support account ownership tracking.

Extern – Amazon Fulfillment Center Case | Operational Strategy & People Analytics Intern — Jul 2025 – Sep 2025
• Analysed turnover data and employee feedback with Python, Pandas and SQL to find operational bottlenecks and recommend workforce improvements.

APOGEE, BITS Pilani | Marketing Intern — Jan 2025 – Mar 2025
• Ran multi-channel outreach campaigns promoting a national technology festival to a network of 1,000+ students.

PROJECTS
GovGuide India | AI checklist tool for government office documents — Jun 2025 – Feb 2026
• Featured in the Google for Startups × Scaler Build the Future Showcase (Startup School: Prompt to Prototype).

JubaShakti | Youth opportunity & eligibility platform (HTML, CSS, JavaScript) — 2026
• Built rule-based eligibility checks for 5 West Bengal schemes plus searchable opportunities and resources for 23 districts.

EDUCATION
Cooch Behar Government Engineering College, MAKAUT — 2022 – 2026
Bachelor of Technology in Computer Science and Engineering | CGPA: 7.54/10

LEADERSHIP & CERTIFICATIONS
• Co-Founder, CGEC DoubtHub (400+ member peer-learning community); Core Team, GDSC CGEC (700+ members).
• McKinsey.org Forward Program; Startup School: Prompt to Prototype (Google for Startups x Scaler); Microsoft Learn 45+ badges.
`;

  const SAMPLE_JD = `Sales Development Representative (SDR) — Remote

About the role
We are hiring a Sales Development Representative to generate qualified pipeline for our B2B SaaS platform. You will run outbound prospecting, book discovery calls for Account Executives, and help us grow ARR.

Responsibilities
- Prospect and qualify leads using LinkedIn Sales Navigator, Salesforce, and Outreach
- Run cold calling and cold email cadences to ICP accounts
- Book 15+ qualified meetings per month and maintain a clean pipeline
- Personalize outreach based on account research and pain points
- Collaborate with AEs on account-based plays and follow-up
- Track activity, conversion rates, and quota attainment in CRM
- Meet or exceed weekly activity metrics (calls, emails, LinkedIn touches)

Requirements
- 6+ months of B2B outbound, SDR, BDR, or similar experience
- Hands-on with Salesforce or HubSpot and a sequencing tool (Outreach, Salesloft, or similar)
- Excellent written communication and objection handling
- Comfortable with cold calling and high-volume prospecting
- Familiarity with SaaS, APIs, and selling to technical buyers is a plus
- Experience with Calendly, Excel, and email deliverability best practices

Nice to have
- SQL or basic data analysis
- Gong or Chorus call recording
- MEDDIC or BANT qualification
`;

  const DICTIONARY = [
    { term: "linkedin sales navigator", jd: ["sales navigator"], resume: ["sales navigator"], section: "Skills" },
    { term: "hubspot", section: "Skills" },
    { term: "salesforce", section: "Skills" },
    { term: "outreach.io", jd: ["outreach io"], resume: ["outreach.io"], section: "Skills" },
    { term: "salesloft", section: "Skills" },
    { term: "apollo", jd: ["apollo.io"], section: "Skills" },
    { term: "dripify", section: "Skills" },
    { term: "snov.io", jd: ["snovio"], section: "Skills" },
    { term: "pipedrive", section: "Skills" },
    { term: "zoho crm", jd: ["zoho"], section: "Skills" },
    { term: "gong", section: "Skills" },
    { term: "chorus", section: "Skills" },
    { term: "calendly", section: "Skills" },
    { term: "clari", section: "Skills" },
    { term: "gainsight", section: "Skills" },
    { term: "zendesk", section: "Skills" },
    { term: "intercom", section: "Skills" },
    { term: "google analytics", section: "Skills" },
    { term: "power bi", jd: ["powerbi"], resume: ["powerbi"], section: "Skills" },
    { term: "tableau", section: "Skills" },
    { term: "excel", section: "Skills" },
    { term: "crm", jd: ["customer relationship management"], resume: ["hubspot", "salesforce", "pipedrive", "zoho"], section: "Skills" },
    { term: "cold calling", jd: ["cold calls", "cold call"], section: "Experience" },
    { term: "cold email", jd: ["cold emails"], resume: ["email outreach", "email campaign"], section: "Experience" },
    { term: "cold outreach", section: "Experience" },
    { term: "outbound prospecting", resume: ["prospecting", "prospected"], section: "Experience" },
    { term: "prospecting", jd: ["prospect"], resume: ["prospected", "prospect"], section: "Experience" },
    { term: "lead qualification", jd: ["qualify leads", "qualifying leads"], section: "Skills or Experience" },
    { term: "lead generation", jd: ["lead gen"], section: "Experience" },
    { term: "pipeline development", jd: ["pipeline generation"], section: "Skills or Experience" },
    { term: "pipeline", section: "Experience" },
    { term: "quota attainment", jd: ["quota"], resume: ["quota"], section: "Experience" },
    { term: "discovery calls", jd: ["discovery call"], section: "Experience" },
    { term: "objection handling", section: "Experience" },
    { term: "account research", resume: ["account research", "icp and account research"], section: "Skills or Experience" },
    { term: "icp", jd: ["ideal customer profile"], section: "Skills" },
    { term: "abm", jd: ["account-based marketing", "account based marketing", "account-based"], section: "Skills or Experience" },
    { term: "bdr", jd: ["business development representative"], section: "Summary or Experience" },
    { term: "sdr", jd: ["sales development representative"], resume: ["sales development"], section: "Summary or Experience" },
    { term: "b2b", section: "Summary or Skills" },
    { term: "outbound", section: "Experience" },
    { term: "inbound", section: "Experience" },
    { term: "cadences", jd: ["cadence", "sequencing tool", "sequencing"], resume: ["cadence", "cadences", "sequence", "sequences"], section: "Experience" },
    { term: "personalized outreach", jd: ["personalize outreach", "personalise outreach", "personalised outreach"], resume: ["personalised outreach", "personalized outreach"], section: "Experience" },
    { term: "follow-up", jd: ["follow up", "follow-ups"], resume: ["follow-up", "follow up", "follow-ups"], section: "Experience" },
    { term: "decision makers", jd: ["decision-makers", "decision maker"], section: "Experience" },
    { term: "stakeholder communication", jd: ["stakeholder management"], resume: ["stakeholder communication", "stakeholders"], section: "Skills or Experience" },
    { term: "qualified meetings", jd: ["book meetings", "meetings booked"], resume: ["book meetings", "meetings booked", "calendar-booking", "calendar booking"], section: "Experience" },
    { term: "conversion rates", jd: ["conversion rate"], section: "Experience" },
    { term: "account executives", jd: ["account executive"], resume: ["account executive", "account executives"], section: "Experience" },
    { term: "arr", jd: ["annual recurring revenue"], section: "Experience" },
    { term: "acv", jd: ["annual contract value"], section: "Experience" },
    { term: "meddic", jd: ["meddpicc", "meddicc"], section: "Skills or Experience" },
    { term: "bant", section: "Skills or Experience" },
    { term: "email deliverability", section: "Skills" },
    { term: "high-volume prospecting", jd: ["high volume prospecting"], section: "Experience" },
    { term: "customer success", jd: ["csm"], section: "Summary or Experience" },
    { term: "technical account management", jd: ["technical account manager", "tam"], resume: ["technical account management", "technical account manager"], section: "Summary or Experience" },
    { term: "account management", jd: ["account manager"], section: "Experience" },
    { term: "onboarding", jd: ["customer onboarding"], section: "Experience" },
    { term: "churn", section: "Experience" },
    { term: "renewals", jd: ["renewal", "renewal rate"], section: "Experience" },
    { term: "qbr", jd: ["qbrs", "quarterly business review", "quarterly business reviews"], section: "Experience" },
    { term: "nps", jd: ["net promoter score"], section: "Experience" },
    { term: "csat", jd: ["customer satisfaction"], section: "Experience" },
    { term: "retention", jd: ["customer retention"], section: "Experience" },
    { term: "expansion", jd: ["upsell", "up-sell", "cross-sell", "cross sell"], section: "Experience" },
    { term: "adoption", jd: ["product adoption"], section: "Experience" },
    { term: "time-to-value", jd: ["time to value", "ttv"], section: "Experience" },
    { term: "nrr", jd: ["net revenue retention"], section: "Experience" },
    { term: "grr", jd: ["gross revenue retention"], section: "Experience" },
    { term: "implementation", section: "Experience" },
    { term: "enablement", jd: ["customer enablement", "sales enablement"], section: "Experience" },
    { term: "escalation", jd: ["escalations"], section: "Experience" },
    { term: "success plan", jd: ["success plans"], section: "Experience" },
    { term: "customer health", jd: ["health score", "health scores"], section: "Experience" },
    { term: "kickoff", jd: ["kick-off", "go-live"], section: "Experience" },
    { term: "customer discovery", section: "Skills or Experience" },
    { term: "team leadership", jd: ["led a team", "team lead"], resume: ["team leadership", "led a", "led a team"], section: "Experience" },
    { term: "playbooks", jd: ["playbook"], section: "Experience" },
    { term: "troubleshooting", jd: ["technical troubleshooting"], section: "Experience" },
    { term: "saas", section: "Skills or Summary" },
    { term: "apis", jd: ["api"], resume: ["api", "apis"], section: "Skills" },
    { term: "sql", section: "Skills" },
    { term: "python", section: "Skills" },
    { term: "javascript", resume: ["javascript", "react.js"], section: "Skills" },
    { term: "data analysis", jd: ["data analytics"], resume: ["analytics", "data analysis", "analysed", "analyzed"], section: "Skills or Experience" },
    { term: "dashboards", jd: ["dashboard"], section: "Experience" },
    { term: "written communication", resume: ["communication", "stakeholder communication"], section: "Skills or Experience" },
    { term: "integrations", jd: ["integration"], section: "Skills or Experience" },
    { term: "generative ai", jd: ["gen ai", "chatgpt"], resume: ["generative ai", "chatgpt"], section: "Skills" }
  ];

  const UK = {
    personalised: "personalized",
    personalise: "personalize",
    organisation: "organization",
    organised: "organized",
    organise: "organize",
    analysed: "analyzed",
    analyse: "analyze",
    programmes: "programs",
    programme: "program"
  };

  const STOP = new Set(
    "a an the and or but if then so than to of in on for at by from with as is are was were be been being it its this that these those you your we our they their them not no nor do does did can could should would will just also into over out up down off about after before during without within per each every any all both few more most other some such only own same too very because while where when what which who how why however plus vs versus etc including included includes include using used use uses via among across following based according related relevant various multiple additional strong excellent proven solid outstanding able ability ideal successful highly well key required requiring requirements prefer preferred preferably bonus nice similar comparable equivalent current currently new role roles job jobs position positions candidate candidates applicant applicants person people team teams company companies organization organizations organisation organisations environment opportunity opportunities office location benefit benefits salary compensation package employment type types full part time times remote hybrid onsite description descriptions responsibility responsibilities qualification qualifications requirement experience experiences year years month months week weeks day days hour hours skill skills tool tools platform platforms system systems process processes knowledge understanding familiarity comfortable help helps helping grow growing generate generating run running maintain maintaining meet meeting exceed exceeding track tracking collaborate collaborating sell selling hire hiring look looking seek seeking join joining work working make made making us".split(/\s+/)
  );

  const ACRONYMS = {
    sql: "SQL", crm: "CRM", icp: "ICP", arr: "ARR", acv: "ACV", api: "API", apis: "APIs",
    b2b: "B2B", b2c: "B2C", sdr: "SDR", bdr: "BDR", nps: "NPS", qbr: "QBR", qbrs: "QBRs",
    tam: "TAM", abm: "ABM", mql: "MQL", nrr: "NRR", grr: "GRR", sso: "SSO", aws: "AWS",
    csat: "CSAT", ttv: "TTV", saas: "SaaS", html: "HTML", css: "CSS", meddic: "MEDDIC",
    bant: "BANT", ae: "AE", aes: "AEs", sla: "SLA"
  };

  const SPECIAL_LABELS = {
    hubspot: "HubSpot",
    salesforce: "Salesforce",
    "outreach.io": "Outreach.io",
    salesloft: "Salesloft",
    "snov.io": "Snov.io",
    dripify: "Dripify",
    calendly: "Calendly",
    "linkedin sales navigator": "LinkedIn Sales Navigator",
    "power bi": "Power BI",
    "google analytics": "Google Analytics",
    "follow-up": "Follow-up",
    "high-volume prospecting": "High-volume prospecting",
    "time-to-value": "Time-to-value",
    "generative ai": "Generative AI"
  };

  const ACTION_VERBS = new Set([
    "prospected", "pitched", "launched", "tracked", "ran", "built", "wrote", "maintained",
    "helped", "mapped", "led", "brought", "shipped", "analysed", "analyzed", "flagged",
    "recommended", "featured", "set", "reached", "drafted", "refined", "shared", "promoted",
    "created", "developed", "managed", "drove", "owned", "increased", "reduced", "improved",
    "implemented", "designed", "coordinated", "executed", "delivered", "achieved", "generated",
    "qualified", "booked", "closed", "negotiated", "presented", "collaborated", "supported",
    "enabled", "onboarded", "resolved", "conducted", "researched", "identified", "established",
    "initiated", "optimized", "organised", "organized", "grew", "expanded", "secured",
    "exceeded", "attained", "founded", "directed", "guided", "trained", "mentored"
  ]);

  const PROPER_SKIP = new Set([
    "about", "role", "responsibilities", "requirements", "nice", "have", "remote", "we", "you",
    "our", "this", "that", "what", "who", "how", "your", "experience", "familiarity", "hands",
    "comfortable", "excellent", "meet", "track", "book", "run", "prospect", "personalize",
    "personalise", "collaborate", "generate", "sales", "development", "representative",
    "account", "executives", "linkedin", "touches", "qualified", "pipeline", "platform",
    "ideal", "candidate", "opportunity", "company", "team", "job", "description", "benefits",
    "location", "type", "full", "time", "outreach", "january", "february", "march", "april",
    "may", "june", "july", "august", "september", "october", "november", "december"
  ]);

  const SECTION_PATTERNS = [
    { key: "summary", re: /^(professional\s+)?summary$|^profile$|^objective$|^about(\s+me)?$/i },
    { key: "skills", re: /^(core\s+)?skills$|^technical\s+skills$|^core\s+competencies$|^competencies$/i },
    { key: "experience", re: /^(work\s+|professional\s+)?experience$|^employment$|^work\s+history$/i },
    { key: "projects", re: /^(selected\s+|academic\s+|key\s+)?projects$/i },
    { key: "education", re: /^education$|^academic\s+background$|^academics$/i },
    { key: "leadership", re: /^(leadership|certifications|leadership\s*&\s*certifications|leadership\s+and\s+certifications|awards|activities|honou?rs)$/i }
  ];

  const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  const DATE_END_RE = new RegExp(
    "((?:" + MONTHS + ")[a-z]*\\.?\\s+\\d{4}\\s*[\\u2013\\u2014\\-]\\s*(?:Present|Current|(?:" + MONTHS + ")[a-z]*\\.?\\s+\\d{4})|\\d{4}\\s*[\\u2013\\u2014\\-]\\s*(?:Present|Current|\\d{4})|(?:" + MONTHS + ")[a-z]*\\.?\\s+\\d{4}|\\d{4})\\s*$",
    "i"
  );

  function ukWord(word) {
    return UK[word] || word;
  }

  function normalize(text) {
    const lowered = String(text || "")
      .toLowerCase()
      .replace(/[\u2018\u2019']/g, "'")
      .replace(/[\u2014\u2013\u2212]/g, "-")
      .replace(/&/g, " and ");
    return lowered.replace(
      /\b(personalised|personalise|organisation|organised|organise|analysed|analyse|programmes|programme)\b/g,
      ukWord
    );
  }

  function escapeRe(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function countPhrase(text, phrase) {
    const haystack = normalize(text);
    const needle = escapeRe(normalize(phrase)).replace(/ /g, "\\s+");
    const matches = haystack.match(new RegExp("(?:^|[^a-z0-9])" + needle + "(?:$|[^a-z0-9])", "g"));
    return matches ? matches.length : 0;
  }

  function hasPhrase(text, phrase) {
    return countPhrase(text, phrase) > 0;
  }

  function displayTerm(term) {
    if (SPECIAL_LABELS[term]) return SPECIAL_LABELS[term];
    if (ACRONYMS[term]) return ACRONYMS[term];
    return term
      .split(/\s+/)
      .map(function (word) {
        return ACRONYMS[word] ? ACRONYMS[word] : word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  function hasOutreachTool(jd) {
    if (/\boutreach\.io\b/i.test(jd)) return true;
    return /\b(salesforce|salesloft|hubspot|apollo|sequencing tool)[\s,/and(]+outreach\b|\boutreach[\s,/]+(salesloft|salesforce|hubspot|apollo)\b/i.test(jd);
  }

  function jdCount(entry, jd) {
    const forms = [entry.term].concat(entry.jd || []);
    let count = 0;
    for (let i = 0; i < forms.length; i++) count += countPhrase(jd, forms[i]);
    if (entry.term === "outreach.io" && hasOutreachTool(jd)) count = Math.max(count, 1);
    return count;
  }

  function resumeHas(entry, resume) {
    const forms = [entry.term].concat(entry.jd || [], entry.resume || []);
    return forms.some(function (form) {
      return hasPhrase(resume, form);
    });
  }

  function isCoveredBy(term, others) {
    return others.some(function (other) {
      return other !== term && (other.indexOf(term) !== -1 || term.indexOf(other) !== -1) && other.length >= term.length;
    });
  }

  function extraTermsFromJd(jd, taken) {
    const counts = {};
    const proper = /\b([A-Z][A-Za-z0-9.+#]*(?:[ \-][A-Z][A-Za-z0-9.+#]*){0,2})\b/g;
    let match;
    while ((match = proper.exec(jd))) {
      const raw = match[1];
      const term = normalize(raw).replace(/\s+/g, " ");
      const words = term.split(/[\s-]+/);
      const skip = words.every(function (word) {
        return STOP.has(word) || PROPER_SKIP.has(word);
      });
      const dotted = term.indexOf(".") !== -1;
      const camel = /[a-z][A-Z]/.test(raw);
      const acronym = term.length <= 5 && term.indexOf(" ") === -1 && raw === raw.toUpperCase() && /[A-Z]/.test(raw);
      const multi = words.length >= 2 && words.length <= 3 && !skip;
      const singleTool = words.length === 1 && term.length >= 5 && !STOP.has(term) && !PROPER_SKIP.has(term);
      if (!skip && (dotted || camel || acronym || multi || singleTool) && !/^\d+$/.test(term)) {
        counts[term] = (counts[term] || 0) + 1;
      }
    }
    const extras = [];
    Object.keys(counts).forEach(function (term) {
      if (isCoveredBy(term, taken) || taken.indexOf(term) !== -1) return;
      extras.push({
        term: term,
        label: displayTerm(term),
        count: counts[term],
        weight: (term.indexOf(" ") !== -1 ? 2 : 1.5) * counts[term],
        section: "Skills or Experience"
      });
    });
    return extras;
  }

  function pageLabel(words) {
    const pages = words / 500;
    if (words < 280) return "Short of one page";
    if (pages <= 1.15) return "About 1 page";
    if (pages <= 1.6) return "About 1.5 pages";
    return "About " + Math.round(pages * 2) / 2 + " pages";
  }

  function buildChecks(resume) {
    const wordCount = (resume.match(/\S+/g) || []).length;
    const pages = pageLabel(wordCount);
    const hasEmail = /\S+@\S+\.\S+/.test(resume);
    const hasPhone = /\+?\d[\d\s().-]{8,}\d/.test(resume);
    const hasLinkedIn = /linkedin/i.test(resume);
    const contactBits = [];
    if (hasEmail) contactBits.push("email");
    if (hasPhone) contactBits.push("phone");
    if (hasLinkedIn) contactBits.push("LinkedIn");
    const contactOk = hasEmail && hasPhone;
    const hasSummary = /\b(summary|profile|objective)\b/i.test(resume);
    const hasExperience = /\b(experience|employment|work history)\b/i.test(resume);
    const hasSkills = /\b(skills|competenc)/i.test(resume);
    const hasEducation = /\b(education|bachelor|b\.?tech|university|college|degree)\b/i.test(resume);
    const bullets = resume.split(/\n/).filter(function (line) {
      return /^\s*[•●◦\u2022\u25cf\uf0b7‣*–—-]\s+/.test(line);
    });
    const metricBullets = bullets.filter(function (line) {
      return /\d/.test(line) || /[%$\u20b9]/.test(line);
    }).length;
    const verbBullets = bullets.filter(function (line) {
      const body = line.replace(/^\s*[•●◦\u2022\u25cf\uf0b7‣*–—-]\s+/, "");
      const first = (normalize(body).split(/[^a-z]+/)[0] || "");
      return ACTION_VERBS.has(first);
    }).length;
    const lengthTone = wordCount >= 350 && wordCount <= 700 ? "ok" : wordCount >= 280 && wordCount <= 1100 ? "warn" : "bad";
    const checks = [
      {
        title: "Contact info",
        detail: contactBits.length ? contactBits.join(", ") + " found." : "Add an email and phone number in the body, not only a header.",
        label: contactOk ? (hasLinkedIn ? "Present" : "Present, no LinkedIn") : "Incomplete",
        tone: contactOk ? "ok" : "bad"
      },
      {
        title: "Summary",
        detail: hasSummary ? "A Summary, Profile, or Objective heading is present." : "Add a short Summary so the first screen states the role you want.",
        label: hasSummary ? "Present" : "Missing",
        tone: hasSummary ? "ok" : "warn"
      },
      {
        title: "Experience",
        detail: hasExperience ? "An Experience heading is present." : "Add an Experience heading ATS parsers expect.",
        label: hasExperience ? "Present" : "Missing",
        tone: hasExperience ? "ok" : "bad"
      },
      {
        title: "Skills",
        detail: hasSkills ? "A Skills heading is present." : "Add a Skills section so tools and methods are easy to parse.",
        label: hasSkills ? "Present" : "Missing",
        tone: hasSkills ? "ok" : "warn"
      },
      {
        title: "Education",
        detail: hasEducation ? "Education, a degree, or a college name is present." : "Add an Education heading and your degree.",
        label: hasEducation ? "Present" : "Missing",
        tone: hasEducation ? "ok" : "warn"
      },
      {
        title: "Length",
        detail: wordCount + " words. " + pages + ". Most SDR, BDR, CS, and TAM resumes read best on one page.",
        label: pages,
        tone: lengthTone
      },
      {
        title: "Numbers in bullets",
        detail: bullets.length === 0
          ? "No bullet lines were detected. Use simple dots or dashes, not icons."
          : metricBullets + " of " + bullets.length + " bullets include a number, percent, or currency.",
        label: metricBullets >= 5 ? "Strong" : metricBullets >= 1 ? "Some" : "None",
        tone: metricBullets >= 5 ? "ok" : metricBullets >= 1 ? "warn" : "bad"
      },
      {
        title: "Action verbs",
        detail: bullets.length === 0
          ? "No bullet lines were detected."
          : verbBullets + " of " + bullets.length + " bullets start with an action verb.",
        label: verbBullets >= 4 ? "Strong" : verbBullets >= 1 ? "Some" : "Weak",
        tone: verbBullets >= 4 ? "ok" : verbBullets >= 1 ? "warn" : "bad"
      }
    ];
    return { checks: checks, wordCount: wordCount, pageLabel: pages };
  }

  function analyzeResume(resume, jd) {
    const found = [];
    for (let i = 0; i < DICTIONARY.length; i++) {
      const entry = DICTIONARY[i];
      const count = jdCount(entry, jd);
      if (count === 0) continue;
      const weight = (3 + Math.min(count, 5)) * (entry.term.indexOf(" ") !== -1 ? 1.15 : 1);
      found.push({
        term: entry.term,
        label: displayTerm(entry.term),
        count: count,
        weight: weight,
        section: entry.section,
        matched: resumeHas(entry, resume)
      });
    }
    const taken = found.map(function (item) { return item.term; });
    extraTermsFromJd(jd, taken).forEach(function (extra) {
      found.push({
        term: extra.term,
        label: extra.label,
        count: extra.count,
        weight: extra.weight,
        section: extra.section,
        matched: hasPhrase(resume, extra.term)
      });
    });
    const terms = found.map(function (item) { return item.term; });
    const kept = found.filter(function (item) { return !isCoveredBy(item.term, terms); });
    const matched = kept.filter(function (item) { return item.matched; }).sort(function (a, b) {
      return b.weight - a.weight || b.count - a.count;
    });
    const missing = kept.filter(function (item) { return !item.matched; }).sort(function (a, b) {
      return b.weight - a.weight || b.count - a.count;
    });
    const totalWeight = kept.reduce(function (sum, item) { return sum + item.weight; }, 0);
    const matchedWeight = matched.reduce(function (sum, item) { return sum + item.weight; }, 0);
    const score = totalWeight === 0 ? 0 : Math.round((100 * matchedWeight) / totalWeight);
    const scoreTone = score >= 70 ? "ok" : score >= 50 ? "warn" : "bad";
    const checks = buildChecks(resume);
    return {
      score: score,
      scoreTone: scoreTone,
      matched: matched,
      missing: missing,
      checks: checks.checks,
      wordCount: checks.wordCount,
      pageLabel: checks.pageLabel,
      keywords: found
    };
  }

  function importance(weight) {
    if (weight >= 5) return "High";
    if (weight >= 4) return "Medium";
    return "Lower";
  }

  function headingKey(line) {
    const trimmed = line.replace(/[:\u2014\u2013-]+\s*$/, "").trim();
    for (let i = 0; i < SECTION_PATTERNS.length; i++) {
      if (SECTION_PATTERNS[i].re.test(trimmed)) return SECTION_PATTERNS[i].key;
    }
    return null;
  }

  function isBullet(line) {
    return /^\s*[•●◦\u2022\u25cf\uf0b7‣*]\s+/.test(line) || /^\s*[-–—]\s+\S/.test(line);
  }

  function bulletText(line) {
    return line.replace(/^\s*[•●◦\u2022\u25cf\uf0b7‣*\-–—]\s+/, "").trim();
  }

  function splitRoleLine(line) {
    const match = line.match(DATE_END_RE);
    let dates = "";
    let left = line.trim();
    if (match) {
      dates = match[1].trim();
      left = line.slice(0, match.index).replace(/[\s\u2014\u2013\-]+$/, "").trim();
    }
    const pipe = left.indexOf("|");
    if (pipe !== -1) {
      return { company: left.slice(0, pipe).trim(), title: left.slice(pipe + 1).trim(), dates: dates, raw: line };
    }
    return { company: left, title: "", dates: dates, raw: line };
  }

  function isRoleLine(line) {
    if (isBullet(line)) return false;
    if (!DATE_END_RE.test(line) && line.indexOf("|") === -1) return false;
    if (/^bachelor|^master|^cgpa|^gpa/i.test(line)) return false;
    return DATE_END_RE.test(line) || /\|/.test(line);
  }

  function parseEntryBlock(lines) {
    const entries = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (isRoleLine(line) && !isBullet(line)) {
        current = splitRoleLine(line);
        current.sub = "";
        current.bullets = [];
        entries.push(current);
        continue;
      }
      if (!current) {
        current = { company: line, title: "", dates: "", sub: "", bullets: [], raw: line };
        entries.push(current);
        continue;
      }
      if (isBullet(line)) current.bullets.push(bulletText(line));
      else if (!current.sub && !current.bullets.length) current.sub = line;
      else if (isBullet(line) === false && current.bullets.length) current.bullets.push(line);
      else current.sub = current.sub ? current.sub + " " + line : line;
    }
    return entries;
  }

  function splitSkillItems(text) {
    const items = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);
      if (ch === "(") depth += 1;
      if (ch === ")" && depth > 0) depth -= 1;
      if (ch === "," && depth === 0) {
        if (current.trim()) items.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) items.push(current.trim());
    return items;
  }

  function parseSkillLines(lines) {
    const rows = [];
    lines.forEach(function (line) {
      if (!line) return;
      const text = isBullet(line) ? bulletText(line) : line;
      const colon = text.indexOf(":");
      if (colon > 0 && colon < 48) {
        const category = text.slice(0, colon).trim();
        const items = splitSkillItems(text.slice(colon + 1));
        rows.push({ category: category, items: items });
      } else {
        const items = splitSkillItems(text);
        if (items.length) rows.push({ category: "", items: items });
      }
    });
    return rows;
  }

  function parseResume(text) {
    const rawLines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const lines = rawLines.map(function (line) { return line.replace(/\s+$/, ""); });
    const sections = { header: [], summary: [], skills: [], experience: [], projects: [], education: [], leadership: [], other: [] };
    let current = "header";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const key = headingKey(line);
      if (key) {
        current = key;
        continue;
      }
      if (!sections[current]) sections[current] = [];
      sections[current].push(line);
    }
    function trimBlock(arr) {
      const copy = arr.slice();
      while (copy.length && !copy[0].trim()) copy.shift();
      while (copy.length && !copy[copy.length - 1].trim()) copy.pop();
      return copy;
    }
    const headerLines = trimBlock(sections.header).filter(function (line) { return line.trim(); });
    const name = headerLines[0] || "Padmanava Das";
    const contacts = [];
    const meta = [];
    for (let i = 1; i < headerLines.length; i++) {
      const line = headerLines[i];
      if (/@|linkedin|\+?\d[\d\s().-]{8,}\d|https?:|\.space\b|\.in\b|\.com\b/i.test(line) && /@|\+|linkedin|\d{5,}/i.test(line)) {
        contacts.push(line);
      } else if (/@|linkedin|\+91/i.test(line)) {
        contacts.push(line);
      } else {
        meta.push(line);
      }
    }
    // Split a typical two-line contact block: location/phone, then email/links.
    const headline = meta[0] || "";
    const extraContact = meta.slice(1);
    const summary = trimBlock(sections.summary).join(" ").replace(/\s+/g, " ").trim();
    const education = trimBlock(sections.education).filter(function (line) { return line.trim(); });
    const leadershipLines = trimBlock(sections.leadership);
    const leadership = leadershipLines.filter(function (line) { return line.trim(); }).map(function (line) {
      return isBullet(line) ? bulletText(line) : line;
    });
    return {
      name: name,
      headline: headline,
      contacts: contacts.concat(extraContact),
      summary: summary,
      skills: parseSkillLines(trimBlock(sections.skills)),
      experience: parseEntryBlock(trimBlock(sections.experience)),
      projects: parseEntryBlock(trimBlock(sections.projects)),
      education: education,
      leadership: leadership,
      originalHeadline: headline
    };
  }

  function extractJobTitle(jd) {
    const lines = String(jd || "").split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) return "";
    const first = lines[0];
    if (first && !/^(about|who we|we are|company|overview|responsibilit|requirement|nice to have|description)\b/i.test(first)) {
      const cleaned = cleanTitle(first);
      if (cleaned && cleaned.length <= 80) return cleaned;
    }
    const labeled = String(jd).match(/(?:job\s+title|title|position|role)\s*[:\-]\s*([^\n]+)/i);
    if (labeled) {
      const cleaned = cleanTitle(labeled[1]);
      if (cleaned) return cleaned;
    }
    const hiring = String(jd).match(/we are hiring (?:an?\s+)?([^.,\n]+?)(?:\s+to\s+|\s+for\s+our|\s+who\b|,|\.)/i);
    if (hiring) {
      const cleaned = cleanTitle(hiring[1]);
      if (cleaned && cleaned.length < 80) return cleaned;
    }
    const next = lines.find(function (line) {
      return /representative|manager|associate|engineer|analyst|specialist|executive|intern|trainee|lead|success|development/i.test(line);
    });
    return next ? cleanTitle(next) : "";
  }

  function cleanTitle(raw) {
    let title = String(raw || "").trim();
    title = title.replace(/\s*[\u2014\u2013|\-]\s*(remote|hybrid|on-?site|full[-\s]?time|part[-\s]?time|contract|india|united states|usa).*$/i, "");
    title = title.replace(/\s+\((?:remote|hybrid|on-?site|full[-\s]?time|part[-\s]?time)\)/i, "");
    title = title.replace(/\s+[\u2014\u2013|\-]\s*$/, "");
    title = title.replace(/^(job title|title|position|role)\s*[:\-]\s*/i, "");
    title = title.replace(/\s+/g, " ").trim();
    if (title.length > 90) title = title.slice(0, 90).replace(/\s+\S*$/, "");
    return title;
  }

  function keywordScore(text, keywords) {
    let score = 0;
    for (let i = 0; i < keywords.length; i++) {
      const k = keywords[i];
      const forms = [k.term, k.label].concat(k.resume || [], k.jd || []).filter(Boolean);
      for (let j = 0; j < forms.length; j++) {
        if (hasPhrase(text, forms[j])) {
          score += k.weight || 1;
          break;
        }
      }
    }
    return score;
  }

  function sortByRelevance(items, keywords) {
    return items
      .map(function (item, index) {
        return { item: item, index: index, score: keywordScore(item, keywords) };
      })
      .sort(function (a, b) {
        return b.score - a.score || a.index - b.index;
      })
      .map(function (row) {
        return row.item;
      });
  }

  function splitSentences(text) {
    if (!text) return [];
    return text.split(/(?<=\.)\s+(?=[A-Z])/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function flattenSkills(rows) {
    const items = [];
    (rows || []).forEach(function (row) {
      (row.items || []).forEach(function (item) { items.push(item); });
    });
    return items;
  }

  function tailorSummary(summary, skills, keywords) {
    const sentences = splitSentences(summary);
    if (!sentences.length) return summary;
    // Keep every original sentence. Reorder only when a later sentence is clearly
    // more relevant and still reads as a complete opening.
    const scored = sentences.map(function (sentence, index) {
      return { sentence: sentence, index: index, score: keywordScore(sentence, keywords) };
    });
    const openerWeak = /^adds\b|^also\b|^plus\b/i;
    const ordered = scored.slice().sort(function (a, b) {
      const aOpen = openerWeak.test(a.sentence) ? 1 : 0;
      const bOpen = openerWeak.test(b.sentence) ? 1 : 0;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return b.score - a.score || a.index - b.index;
    }).map(function (row) { return row.sentence; });
    // If reordering would start with a fragment-like sentence, keep original order.
    let chosen = sentences;
    if (ordered[0] && !openerWeak.test(ordered[0]) && keywordScore(ordered[0], keywords) >= keywordScore(sentences[0], keywords)) {
      chosen = ordered;
    }
    let text = chosen.join(" ").replace(/\s+/g, " ").trim();
    const extras = [];
    flattenSkills(skills).forEach(function (item) {
      if (extras.length >= 4) return;
      if (keywordScore(item, keywords) <= 0) return;
      if (hasPhrase(text, item)) return;
      extras.push(item);
    });
    if (extras.length) {
      if (text && !/[.!?]$/.test(text)) text += ".";
      text += (text ? " " : "") + "Skills include " + extras.join(", ") + ".";
    }
    return text;
  }

  function skillRowScore(row, keywords) {
    return (row.items || []).reduce(function (sum, item) {
      return sum + keywordScore(item, keywords);
    }, 0);
  }

  function bestSkillCategory(term, rows) {
    const lower = normalize(term);
    const salesish = /sales|outreach|crm|pipeline|prospect|hubspot|salesforce|linkedin|cadence|cold|quota|sdr|bdr|deliverability|dripify|snov|apollo|calendly/;
    const csish = /customer|success|onboard|churn|renew|qbr|nps|csat|retention|account management|stakeholder/;
    if (salesish.test(lower)) {
      const row = rows.find(function (r) { return /sales|prospect|outbound/i.test(r.category || ""); });
      if (row) return row;
    }
    if (csish.test(lower)) {
      const row = rows.find(function (r) { return /customer|success/i.test(r.category || ""); });
      if (row) return row;
    }
    const tech = rows.find(function (r) { return /technical|tech|tools/i.test(r.category || ""); });
    return tech || rows[0] || null;
  }

  function tailorSkills(rows, keywords, ticked) {
    const copy = (rows || []).map(function (row) {
      const items = sortByRelevance(row.items.slice(), keywords);
      return { category: row.category, items: items };
    });
    (ticked || []).forEach(function (term) {
      const label = displayTerm(term);
      const already = flattenSkills(copy).some(function (item) {
        return normalize(item) === normalize(label) || hasPhrase(item, label) || hasPhrase(item, term);
      });
      if (already) return;
      let row = bestSkillCategory(term, copy);
      if (!row) {
        row = { category: "Added for this role", items: [] };
        copy.push(row);
      }
      row.items.push(label);
    });
    return copy;
  }

  function cloneEntries(entries) {
    return (entries || []).map(function (entry) {
      return {
        company: entry.company,
        title: entry.title,
        dates: entry.dates,
        sub: entry.sub,
        bullets: (entry.bullets || []).slice(),
        raw: entry.raw
      };
    });
  }

  function tailorResume(resumeText, jd, tickedTerms) {
    const parsed = parseResume(resumeText);
    const analysis = analyzeResume(resumeText, jd);
    const keywords = analysis.keywords || analysis.matched.concat(analysis.missing);
    const title = extractJobTitle(jd);
    parsed.headline = title || parsed.headline;
    parsed.summary = tailorSummary(parsed.summary, parsed.skills, keywords);
    parsed.skills = tailorSkills(parsed.skills, keywords, tickedTerms || []);
    parsed.experience = cloneEntries(parsed.experience).map(function (entry) {
      entry.bullets = sortByRelevance(entry.bullets, keywords);
      return entry;
    });
    parsed.projects = cloneEntries(parsed.projects).map(function (entry) {
      entry.bullets = sortByRelevance(entry.bullets, keywords);
      return entry;
    });
    parsed.jobTitle = title;
    parsed.analysis = analysis;
    return parsed;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderRole(entry) {
    const left = "<strong>" + escapeHtml(entry.company) + "</strong>" +
      (entry.title ? " | " + escapeHtml(entry.title) : "");
    const dates = entry.dates ? "<span class=\"dates\">" + escapeHtml(entry.dates) + "</span>" : "";
    let html = "<div class=\"role\"><p class=\"role-line\"><span class=\"role-left\">" + left + "</span>" + dates + "</p>";
    if (entry.sub) html += "<p class=\"sub\">" + escapeHtml(entry.sub) + "</p>";
    if (entry.bullets && entry.bullets.length) {
      html += "<ul>" + entry.bullets.map(function (b) { return "<li>" + escapeHtml(b) + "</li>"; }).join("") + "</ul>";
    }
    html += "</div>";
    return html;
  }

  function renderResumeHtml(model) {
    if (!model) return "";
    let html = "<article class=\"sheet\">";
    html += "<h1>" + escapeHtml((model.name || "").toUpperCase()) + "</h1>";
    if (model.headline) html += "<p class=\"headline\">" + escapeHtml(model.headline) + "</p>";
    (model.contacts || []).forEach(function (line) {
      html += "<p class=\"contact\">" + escapeHtml(line) + "</p>";
    });
    if (model.summary) {
      html += "<h2>Summary</h2><p class=\"summary\">" + escapeHtml(model.summary) + "</p>";
    }
    if (model.skills && model.skills.length) {
      html += "<h2>Core Skills</h2>";
      model.skills.forEach(function (row) {
        html += "<p class=\"skill-row\">";
        if (row.category) html += "<strong>" + escapeHtml(row.category) + ": </strong>";
        html += escapeHtml((row.items || []).join(", ")) + "</p>";
      });
    }
    if (model.experience && model.experience.length) {
      html += "<h2>Experience</h2>";
      model.experience.forEach(function (entry) { html += renderRole(entry); });
    }
    if (model.projects && model.projects.length) {
      html += "<h2>Projects</h2>";
      model.projects.forEach(function (entry) { html += renderRole(entry); });
    }
    if (model.education && model.education.length) {
      html += "<h2>Education</h2>";
      model.education.forEach(function (line, index) {
        const parsed = splitRoleLine(line);
        if (parsed.dates && index === 0) {
          html += "<p class=\"role-line\"><span class=\"role-left\"><strong>" + escapeHtml(parsed.company + (parsed.title ? " | " + parsed.title : "")) + "</strong></span><span class=\"dates\">" + escapeHtml(parsed.dates) + "</span></p>";
        } else {
          html += "<p class=\"edu\">" + escapeHtml(line) + "</p>";
        }
      });
    }
    if (model.leadership && model.leadership.length) {
      html += "<h2>Leadership &amp; Certifications</h2><ul>";
      model.leadership.forEach(function (line) {
        html += "<li>" + escapeHtml(line) + "</li>";
      });
      html += "</ul>";
    }
    html += "</article>";
    return html;
  }

  function resumeToText(model) {
    if (!model) return "";
    const out = [];
    out.push((model.name || "").toUpperCase());
    if (model.headline) out.push(model.headline);
    (model.contacts || []).forEach(function (line) { out.push(line); });
    if (model.summary) {
      out.push("");
      out.push("SUMMARY");
      out.push(model.summary);
    }
    if (model.skills && model.skills.length) {
      out.push("");
      out.push("CORE SKILLS");
      model.skills.forEach(function (row) {
        out.push((row.category ? row.category + ": " : "") + (row.items || []).join(", "));
      });
    }
    function pushEntries(title, entries) {
      if (!entries || !entries.length) return;
      out.push("");
      out.push(title);
      entries.forEach(function (entry) {
        const line = [entry.company, entry.title].filter(Boolean).join(" | ") + (entry.dates ? " — " + entry.dates : "");
        out.push(line);
        if (entry.sub) out.push(entry.sub);
        (entry.bullets || []).forEach(function (b) { out.push("• " + b); });
      });
    }
    pushEntries("EXPERIENCE", model.experience);
    pushEntries("PROJECTS", model.projects);
    if (model.education && model.education.length) {
      out.push("");
      out.push("EDUCATION");
      model.education.forEach(function (line) { out.push(line); });
    }
    if (model.leadership && model.leadership.length) {
      out.push("");
      out.push("LEADERSHIP & CERTIFICATIONS");
      model.leadership.forEach(function (line) { out.push("• " + line); });
    }
    return out.join("\n");
  }

  function collectOriginalTexts(model) {
    const bag = [];
    function add(value) {
      if (value) bag.push(normalize(value));
    }
    add(model.summary);
    (model.education || []).forEach(add);
    (model.leadership || []).forEach(add);
    flattenSkills(model.skills).forEach(add);
    (model.experience || []).concat(model.projects || []).forEach(function (entry) {
      add(entry.company);
      add(entry.title);
      add(entry.sub);
      (entry.bullets || []).forEach(add);
    });
    return bag;
  }

  return {
    DEFAULT_RESUME,
    SAMPLE_JD,
    analyzeResume,
    parseResume,
    extractJobTitle,
    tailorResume,
    renderResumeHtml,
    resumeToText,
    hasPhrase,
    keywordScore,
    importance
  };
})();


export const DEFAULT_RESUME = ATS.DEFAULT_RESUME;
export const SAMPLE_JD = ATS.SAMPLE_JD;
export const analyzeResume = ATS.analyzeResume;
export const parseResume = ATS.parseResume;
export const extractJobTitle = ATS.extractJobTitle;
export const tailorResume = ATS.tailorResume;
export const renderResumeHtml = ATS.renderResumeHtml;
export const resumeToText = ATS.resumeToText;
export const hasPhrase = ATS.hasPhrase;
export const keywordScore = ATS.keywordScore;
export const importance = ATS.importance;
