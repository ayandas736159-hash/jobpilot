# JobPilot

JobPilot helps Padmanava Das tailor a one-page resume and review job-application answers for remote SDR/BDR, Customer Success, and Associate TAM roles. The resume tool only reorders real bullets and skills. Written answers are drafted from his profile and experience stories. Nothing in this repo clicks Submit.

## What is in the repo

- `extension/` — Chrome extension (Manifest V3, no framework). Side panel for the profile, match score, tailored resume, and form review.
- `web/` — static site for Vercel Hobby: landing page, resume tailor, and local sample forms.
- `shared/` — the scoring, field detection, prompts, and PDF helpers. `npm run build` copies them into the extension and the site.
- `test/` — keyword scoring and form-field tests.

## Privacy

The profile, resume, experience stories, and Groq API key stay in the browser (`chrome.storage.local` in the extension, `localStorage` on the site). The key is sent only to `https://api.groq.com` when you test it, write an answer, or ask for help with an ambiguous multiple-choice question. It is not committed, not sent to the job page, and not stored on a JobPilot server. There are no serverless functions.

## Models

Groq retired `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` for free and developer tiers on 16 August 2026. Both had a 131,072-token window. JobPilot uses Groq’s recommended replacements, which keep that long window:

- Best answers (default): `openai/gpt-oss-120b`
- Save credits: `openai/gpt-oss-20b`

Settings has a custom model id if an account still has an older model. Multiple-choice guesses, when the profile rules are not enough, always use the cheaper model and a very short prompt. Descriptive answers use the selected model, one call per question, with the prompt in `shared/prompts.js`.

## Extension setup

1. `git clone` this repository.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Load unpacked and choose the `extension` folder.
5. Open the side panel and paste a Groq API key under Settings.
6. The sample profile is already filled from Padmanava’s public resume. Work authorization, notice period, and salary are blank on purpose.

To update after a pull: `git pull`, then on `chrome://extensions` click Reload on JobPilot. A normal page refresh is not required. Scan talks to the focused application tab and injects into its frames if the script is not there yet.

Content scripts run on `http` and `https` pages. To try the included forms, serve the site (`npm start`) and open:

- http://127.0.0.1:4173/demo/apply.html — Greenhouse / Lever-style, two pages
- http://127.0.0.1:4173/demo/gform.html — the radio, checkbox, dropdown, and internship question

Scan the form, edit the proposed values, then Fill this page. Use Next page on the Greenhouse sample. The Submit button is outlined and is never clicked.

## Web app

```bash
npm install
npm start
```

Open http://127.0.0.1:4173 . The tailor works offline for scoring and PDF download. The optional answer box needs a Groq key typed into that page.

## Deploy on Vercel Hobby

1. Push this repository to GitHub.
2. In Vercel, import the GitHub repo.
3. Set the root directory to `web`.
4. Leave the framework preset empty. `web/vercel.json` is a static site with clean URLs.
5. Deploy. No environment variables are required.

## Tests

```bash
npm test
```

That copies `shared/` into the extension and the site, then checks keyword scoring, choice rules, prompt grounding, field detection, and that a sample fill does not submit.

## Limits

- The match score is keyword overlap, not a recruiter’s judgment.
- PDF import handles digitally generated text (including the LibreOffice-style resume with ToUnicode maps). A scanned image PDF will not extract; paste the text instead.
- The downloaded PDF is a simple text file in PDF form. Print from the web tailor if you want the styled one-page layout.
- Google Forms dropdowns that build their options only after you open them cannot be chosen until those options are in the page.
- Choice rules cover CGPA scale, CGPA buckets, internship type, and tools named in the resume. Other ambiguous choices can use one cheap model call, or you can pick them.
- Answers can still drift. The panel flags numbers that are not in the profile. Read the draft before filling.
- JobPilot will not click Submit, Apply, or Send application. You do that last step.
