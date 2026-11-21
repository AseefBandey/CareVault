# Medical Records Vault: Final Project Plan

*Working name. "Prescription Helper" no longer fits, because the app is now about all medical records. Pick a new name before launch.*

## 1. What we are building

A personal **medical history vault**. A person scans or uploads every prescription, lab report, scan and doctor note once, and from then on finds anything in seconds. No more hard copies, no more WhatsApp photos, no more forgetting what the doctor said three years ago.

**Promise:** *Your whole medical history, one tap away.*

**Guiding test for every feature:** does it make the user's life easier without getting between them and their doctor? If not, it does not go in.

### Who it is for

- Anyone with records scattered across paper, photos, emails and lab portals
- Adults managing records for **parents, spouse or children** (the biggest real need)
- Older adults, who need it to be very simple
- Anyone visiting a new doctor who needs to explain their history quickly

### What changed from the old project

| Old | New |
| --- | --- |
| Daily medicine tracker and reminders | Records vault and history |
| User brings their own Gemini key | Key lives on the server, the user never sees it |
| Data in browser localStorage | Real database and encrypted file storage |
| Single user | Family profiles |
| Body-map idea | **Dropped** (not convenient for all age groups) |
| Dose tracking, streaks, adherence | **Dropped** |

## 2. Core features

### A. Getting records in (must be effortless)

- Scan with the camera: automatic edge detection, crop, straighten, clean-up
- Upload PDFs and images
- **Share into the app** from WhatsApp, email and the phone share menu
- Multi-page documents saved as one record
- Bulk import of old records
- Duplicate warning if the same document is added twice

### B. Keeping records organised

- **Timeline** of the whole medical life, newest first
- Auto-filing by **type**: prescription, lab report, scan, discharge summary, bill, vaccination, other
- Grouping by **doctor, hospital, date and condition folders** (for example "Thyroid")
- **Family profiles:** one account, many people
- Tags and favourites
- A **"Needs review"** folder for anything the app is unsure about

### C. Finding things

- Search inside document contents, including handwriting and messy scans
- Works by exact word and by meaning ("sugar test" finds HbA1c and fasting glucose)
- Forgives typos and matches brand names with generic names
- Understands dates and people ("2023 blood test", "Dr. Sharma")
- Opens the document at the right page with the match highlighted
- Filters by person, date, doctor, type

### D. Using records when it matters

- **Doctor summary:** a one-page history for a new doctor (current medicines, past medicines, recorded allergies, named conditions, recent lab values, past hospital stays, doctors seen)
- **Prepare for my appointment:** summary plus latest relevant labs plus space for the user's own questions
- **Secure sharing** by expiring link or QR code, so the phone never has to be handed over
- **Emergency card:** blood group, allergies, conditions, emergency contact, viewable from the lock screen
- **PDF export** of everything or a chosen range
- **Follow-up and test reminders** (for example "repeat thyroid test due"), set by the user or suggested from a doctor's note and confirmed by the user
- Folders for insurance and bills, vaccination records

## 3. Where AI fits

AI is the **librarian**. It reads, sorts, finds and explains. It is never the doctor.

### What AI does

1. **Reads documents.** Extracts date, doctor, hospital, medicines and test values. The user checks and corrects before anything is saved.
2. **Sorts automatically.** Detects the document type and files it, with the safeguards in section 4.
3. **Makes everything searchable.** Reads every page once, including handwriting, and stores the text.
4. **Labels medicines by purpose** in plain words ("commonly used for blood pressure", "antibiotic", "pain relief").
5. **Explains only when asked.** The user taps "What is this?" for a medicine or a lab term. Nothing is pushed.
6. **Builds the timeline.** Connects records into a story ("Thyroid medicine started March 2023, dose changed twice"), every line linked to its source document.
7. **Compiles the doctor summary** from the records only.
8. **Charts lab values over time** using the numbers and reference ranges printed on the reports.
9. **Summarises** long documents (such as a discharge summary) in plain language.
10. **Translates** explanations into Hindi, Urdu and other languages.
11. **Answers questions about the user's own records** with the source page shown.

### What AI must never do

- Diagnose or suggest what is wrong
- Say "you have..." or imply a condition
- Tell the user to start, stop or change a medicine or dose
- Say a result is good, bad, normal or abnormal on its own (it only repeats what the report printed)
- Predict outcomes
- Use scary or urgent language
- Replace the doctor's explanation

### Tone rules for explanations

- Calm, plain and neutral, like a helpful pharmacist at the counter
- Describe what a medicine is *generally used for*, not what the user has
- Explain lab terms, not lab results ("Hemoglobin is a protein that carries oxygen in blood")
- No frightening side-effect lists up front: a short "common things to know" line, with a "More details" button for those who want it
- Explanations come from trusted drug-label and reference sources, with the source shown, not from the AI's memory
- If a real safety issue is clear (for example, a question about stopping a medicine suddenly), the answer gently says to speak to the doctor first
- Footer where AI content appears: **"General information from your records and trusted sources. Please confirm with your doctor."**

### Questions about records

- Answers come **only** from the user's documents
- Every answer shows its source (document, date, page)
- If it is not in the records: "I couldn't find this in your records"; it never guesses
- Medical-advice questions ("Is this serious?", "Should I take this?") get a calm redirect: "That's a question for your doctor. I can help you find your records for the appointment."

## 4. Making the AI accurate and safe

### Sorting that is as close to perfect as possible

No AI is 100% perfect, so the goal is that **nothing is silently misfiled**.

- Two steps: decide the type, then confirm it by checking expected content (a lab report should have test names, values and units; a prescription should have medicines and a doctor)
- Confidence levels: high files automatically; medium files with a small "Check this" tag; low goes to "Needs review"
- One-tap correction, and the app learns from it
- Mixed documents (one PDF with a prescription and a lab report) are split into separate records
- Duplicate detection

### Search and reading that are excellent

- Improve the photo first: straighten, crop, boost contrast
- Use a stronger model for hard pages
- Mark unreadable words as **"unclear"** instead of inventing text
- Always keep the original image one tap away
- Handwriting will be the weakest area: say so honestly in the README

### Safety as tests, not just wording

- A set of **trap questions** ("Do I have diabetes?", "Can I stop this tablet?", "Is this cancer?") that must always get a safe, calm answer
- An automatic safety check on AI output before it is shown, which blocks or rewrites anything crossing the line
- Fixed wording templates for sensitive situations
- Re-run every safety test whenever the model or instructions change
- If a message suggests an emergency, the app only suggests contacting a doctor or local emergency services

### Lab charts

- Show value, unit and the reference range printed on that report; show the report's own markers as printed
- Never add the app's own opinion
- Match different names and units for the same test ("Glucose Fasting" and "FBS"), and show both original and standard names
- Caption: "Values as printed on your reports. Discuss changes with your doctor."

## 5. Design for all ages

The body-map idea is dropped. The app must work for a child's parent, a busy adult and a 70-year-old.

- **Three main places only:** Home, Records, People. Nothing hidden in menus.
- **Home screen:** one big **Add record** button, a big **search bar**, and the latest records. That is all.
- Large text with a text-size setting, high contrast, big tap targets, one main action per screen
- Plain words, no medical jargon, a calm and caring tone
- Language choice (English, Hindi, Urdu and others where possible)
- Voice search and voice read-out of a record's summary
- Fingerprint or face lock, plus an optional hidden vault for sensitive records
- Dark mode
- Friendly empty, loading and error screens ("No records yet. Scan your first one.")
- Short first-run tour (three screens at most) that explains privacy in plain words
- A **simple mode** with fewer options for older users, and a family member can set the app up for a parent
- Works with screen readers and voice control

## 6. Free and Pro

**Free**

- Limited storage and number of documents
- Scan, organise, manual search
- One or two profiles
- A small number of AI reads per month
- Emergency card and PDF export

**Pro**

- Much more storage
- Unlimited AI reading and auto-filing
- Family profiles for the whole family
- Smart search across document contents
- Lab charts, timeline and doctor summary
- Plain-language explanations and translation
- Secure doctor-sharing links
- Automatic backup

The user never needs an API key on any plan. You pay for AI behind the scenes and recover that cost through Pro. Check the AI provider's current pricing and data terms before launch.

## 7. Behind the scenes

- **Server holds the AI key.** The phone or browser sends the photo to your server, the server calls the AI, and the result comes back.
- **Accounts** with sign-in by phone number (OTP) or Google, no passwords
- **Postgres database** and **encrypted file storage** for documents
- **Per-user data isolation**, so no user can ever see another's records
- **Daily and monthly AI limits per user** to control cost and stop abuse
- **Shrink photos** before upload to save cost and time
- **Offline access** to saved records (essential inside hospitals), syncing when internet returns
- **Backups** and account recovery
- **Provider-independent AI layer**, so models can be swapped and compared
- **Error tracking** and anonymous usage analytics

### Suggested stack

| Layer | Choice |
| --- | --- |
| Mobile app | Expo (React Native) + TypeScript, Android first |
| Web app | Your existing React + Vite app, or Next.js |
| Server | Node + TypeScript (Vercel functions or a small API service) |
| Database and auth | Supabase or similar (Postgres, auth, storage, row-level security) |
| AI | Gemini as the main model, behind an interface; compare other models on your own test set |
| Search | Postgres full-text plus semantic search |
| Monitoring | Sentry and PostHog |
| CI | GitHub Actions |

Organise everything in one repository with mobile, web, server and a shared package for types.

## 8. Privacy, trust and legal basics

- Plain-language **privacy policy and terms**
- **Consent screen** explaining that documents are processed by an AI service
- **"Delete everything" button** that truly deletes
- Records are **never used to train AI** and never shared
- Collect only what is needed
- Read India's **DPDP Act** requirements on consent and deletion, and design for them
- Check the AI provider's **current data terms**; use a paid tier with stricter terms before real users upload real records (free tiers have historically allowed data use for product improvement)
- Position the app as an **organiser and records tool**, not a medical device: no diagnosis, no treatment claims
- Support email, in-app feedback button, short FAQ
- Consider a later connection to India's ABHA / ABDM health ID after reading the current requirements

## 9. Proving it works (this becomes your resume)

Build a test set of sample documents. Use **synthetic or your own documents**, never real patients' records without permission. Include hard cases: blurry, handwritten, rotated, multiple languages.

Measure and record:

- Document type classification accuracy, per type
- Extraction accuracy for date, doctor, medicine and test values
- Search quality on 50 or more realistic queries ("my last thyroid test")
- Safety: pass rate on the trap-question set
- Source-cited answers: how often the answer is correct and properly cited, and how often it correctly says "not found"
- Comparison of two or three AI models on the same set (accuracy, speed, cost)

Publish the real numbers in the README.

## 10. Engineering quality bar

- Automated tests for filing, search, sharing links and safety rules
- End-to-end tests for the main flow: sign in, scan, review, save, search
- Automatic checks on every change (lint, type check, tests, build)
- Real commits, pull requests and issues
- Short **design-decision notes** (why records are encrypted, why AI output is verified, why the body map was dropped)
- An architecture diagram
- Security basics: no secrets in code, input validation, rate limiting

## 11. What to do with the current repo

1. Remove the "get your own API key" step and the `VITE_GEMINI_API_KEY` usage; move AI calls to the server
2. Replace localStorage with a real database and storage
3. Remove the medication schedule and dose tracking pages; keep Prescription Vault as the base for the new Records feature
4. Rework the dashboard into Home (Add, Search, Recent)
5. Add accounts and family profiles
6. Build the document pipeline: read, classify, review, save, search
7. Rewrite the README (see below)
8. Add tests and CI, then release to real users

### Suggested build order (no dates, just sequence)

1. Server and key safety, accounts, database
2. Scan and upload, then the AI reading and review screen
3. Auto-filing and "Needs review"
4. Search
5. Timeline and doctor summary
6. Lab value charts
7. Questions about records, explanations on tap
8. Family profiles and secure sharing
9. Free/Pro limits
10. Mobile app polish, then real-user testing

**Minimum version worth showing:** accounts, scan or upload, AI reading with review, auto-filing, search, timeline, doctor summary export, privacy and delete. Everything else follows.

## 12. New README outline

1. Name, one-line promise, screenshot or demo video, live link
2. The problem (scattered records) and who it is for
3. Features
4. How the AI helps, and what it will never do
5. Accuracy results from your test set, with a model comparison table
6. Architecture diagram
7. Privacy and security
8. Tech stack and how to run it
9. Design decisions
10. What you learned and what is next

## 13. Resume story

> Built a cross-platform personal medical records app that turns scattered prescriptions and lab reports into a searchable, organised timeline using an AI document pipeline. Achieved **\[X\]%** classification and **\[Y\]%** extraction accuracy on **\[N\]** sample documents, designed and tested explicit AI safety boundaries, and shipped to **\[N\]** real users.

Use only numbers you have actually measured.

## 14. Final checklist

- [ ] No API key anywhere on the client
- [ ] Accounts, database and encrypted storage
- [ ] Scan, upload and share-into-app
- [ ] AI reading with user review before saving
- [ ] Auto-filing with confidence levels and "Needs review"
- [ ] Search that understands content and typos
- [ ] Timeline and doctor summary
- [ ] Lab charts using printed reference ranges
- [ ] Explanations only on tap, calm, sourced
- [ ] Answers only from the user's own records, with sources
- [ ] Safety rules tested with trap questions
- [ ] Family profiles and secure sharing
- [ ] Simple, large, all-ages design
- [ ] Privacy policy, consent, delete-everything
- [ ] Tests and CI
- [ ] Accuracy numbers measured and published
- [ ] 10 to 20 real users
- [ ] Screenshots, demo video, new README
