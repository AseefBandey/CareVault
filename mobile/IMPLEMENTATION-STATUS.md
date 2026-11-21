# CareVault mobile implementation status

This document compares the Android-first Expo application in `mobile/` against the requirements in `Medical Records Vault Final Project Plan.md`. It deliberately separates code that exists from services, testing or product work that is still required. This is not a claim that the application is ready for real patient data.

## Mobile app and core workflow

| Plan requirement | Status in this package | Important qualification |
|---|---|---|
| Android-first mobile app using Expo / React Native / TypeScript | Implemented as source in `mobile/` | Requires dependency installation and a device/emulator run to validate your environment. No signed APK is included. |
| Three primary places: Home, Records, People | Implemented | Additional tools are reached from Home/settings. |
| Large text, high contrast, dark mode, simple mode, large tap targets | Implemented in UI | Full accessibility certification and all screen-reader/device testing remain. |
| Language choice | Partial | English/Hindi/Urdu preference exists, and summaries can be spoken with a selected speech language. Full UI localisation and AI translation are not implemented. |
| First-run privacy tour | Implemented as a three-screen first-launch notice | It is a basic product tour, not a complete legal/privacy policy or consent-management framework. |
| Biometric lock | Implemented for app foreground/re-entry | Requires enrolled device biometrics; must be tested on physical devices. It does not replace encryption or account security. |
| Camera scan / photo / multiple files / PDF uploads | Implemented in app source | The Expo 58 native multi-page scanner and device permissions must be verified on a compatible Android build. Document picker bulk import works as a source workflow. |
| Crop, straighten, contrast clean-up | Partial | Native multi-page scanning is wired; a complete post-capture crop/straighten/enhance editor is not implemented. |
| Share into app from WhatsApp / email / OS share menu | Not implemented | Incoming `carevault://share/<token>` links are handled; that is not the same as receiving document files from arbitrary apps. |
| Save a multi-page PDF as one record | Implemented for selected PDF and scanner PDF output | Mixed PDFs are not automatically split into separate record items. |
| Duplicate warning | Implemented as a local SHA-256 attachment match | Hashing a provider URI can fail; it is a warning, not a perfect duplicate guarantee. |
| Timeline, record types, people/family profiles, tags, favourites, Needs review | Implemented | Search filters include person, type, doctor, hospital, date range, tags, favourite and review state. Family access is profiles under one account; secure family invitations/roles and delegated permissions are not implemented. |
| Real database, private file storage, per-user RLS | Supabase schema and client integration included | User must create/configure Supabase, run the SQL, verify RLS and perform cross-user security tests. |
| Local-first records and pending-sync status | Implemented in source | Best-effort sync happens from Settings and when the app returns to foreground; it is not a fully conflict-safe offline sync engine. Test offline/online behaviour before relying on it. |

## AI, searching and safe explanations

| Plan requirement | Status in this package | Important qualification |
|---|---|---|
| Server-side AI key; no user-facing API key | Implemented in architecture | Must configure a privately hosted Node API and keep `GEMINI_API_KEY` only in its server environment. |
| AI reads date, doctor, hospital, type, medicine names, lab values and text | Implemented as extraction draft | Every selected file is sent to extraction sequentially and merged into one review draft. The workflow does not automatically split unrelated files into separate records; review every field against each original before saving. |
| User checks/corrects extracted content before save | Implemented | Extraction requires a signed-in account and explicit consent; demo mode never uploads files to AI. |
| Confidence levels and Needs review | Partial | Review states exist; current confidence is a model estimate of extraction quality, not calibrated classification confidence. A rigorous threshold pipeline needs labelled validation data. |
| OCR handwriting / multiple languages / stronger-model fallback / mark unreadable as unclear | Partial | The configured AI service may transcribe legible text; there is no independent OCR pipeline, handwriting guarantee or model-fallback router. README warns that handwriting is weak. |
| Sort by content and split mixed documents | Partial | Single-record type detection exists. Automatic multi-document page segmentation and split-to-records workflow are not implemented. |
| Search exact word, typo tolerance, common name aliases | Partial | Local text/metadata search includes a small alias expansion. SQL search function adds full-text/trigram rules when installed. Semantic embeddings, comprehensive drug-brand/generic mappings and opening a match on the exact highlighted page are not implemented. |
| Safe questions about own records, showing source document/date/page | Partial | `Ask my records` searches local records and links matching records; medical-advice trap questions are redirected. It is not a grounded generative Q&A model and does not provide reliable per-page source citations/highlighting. |
| Medicine explanations from trusted drug-label/reference sources | Partial | Only a small glossary of lab terms is bundled with source links. A verified, maintained medication-label/reference integration is not included. |
| Plain-language summaries and translations | Partial | Local summaries and text-to-speech exist. Trusted-source summaries, full translation and all-language validation remain. |
| Safety output check and trap question tests | Partial | The server normalizer blocks several unsafe summary patterns and existing server tests cover a small trap set. A separate comprehensive output gate and expanded recurring test corpus are needed. |
| Lab charts using report's units, ranges, markers and original names | Partial | A basic lab trend visualisation uses captured values; validating numeric parsing, distinct units, name harmonisation and range/marker accuracy across real reports remains. No app-generated normal/abnormal opinion is shown. |

## Using records and family features

| Plan requirement | Status in this package | Important qualification |
|---|---|---|
| Doctor summary and appointment preparation PDF | Implemented as export flows | Summary uses saved metadata, not a clinically validated history model. Review before sharing. |
| Secure share link / QR / expiry / revoke | Implemented as Supabase token-hash table, share endpoint and QR | Requires deployed HTTPS API + configured public URL. A person who obtains the URL can view limited fields until expiration/revocation; it is a bearer link, not identity-verified sharing. Deep links require the app installed. |
| Emergency card | Implemented in app and Supabase sync | It is not visible from the operating system lock screen. Add critical info separately to Android Emergency Information or Apple Medical ID. |
| PDF export | Implemented for doctor summary, appointment pack and selected/all record metadata | This is not a forensic full-fidelity export of every original attachment; original files can be opened/shared separately. |
| Follow-up/test reminders | Implemented locally with scheduled device notifications and optional Supabase metadata sync | Notification permissions and re-scheduling after reinstall or on a second device need testing; suggestions extracted from notes are not automatic without user confirmation. |
| Insurance/bill/vaccination folders | Basic document types / tags | Dedicated insurance workflow and vaccination schedules are not implemented. |
| Offline access | Local records cached in app-private storage | Attachments and records are local-first, but sync conflict resolution, background uploads and a verified encrypted cache are incomplete. |

## Privacy, business and release requirements

| Plan requirement | Status in this package | Important qualification |
|---|---|---|
| Server-held AI key | Code supports it | Deployment and environment variables are your responsibility. Never put secrets in Expo `EXPO_PUBLIC_` variables. |
| Accounts, Postgres and storage | Schema/client integration included | SMS provider, Google OAuth configuration, Supabase setup and cross-user tests are required. |
| Consent | AI processing consent prompt exists | Privacy notice, lawful basis, retention, minors/family consent and actual vendor terms need legal review. |
| Delete everything | App control and database deletion flow exist | Verify local files, storage objects, backups and all related rows in a test project before production; cloud retention/backup lifecycle cannot be fully controlled by this UI. |
| No AI training / never shared | Not guaranteed by code | Select a suitable paid AI service plan, inspect current contractual/data terms, and publish accurate privacy wording. Do not claim unconditional no-training until verified. |
| DPDP Act / legal terms / medical-device positioning | Templates/checklist included | These are drafting aids, not legal advice or proof of compliance. Obtain qualified India privacy/security review. |
| Free/Pro tiers and AI limits | UI mock-up only | Usage enforcement, quotas, payment processing and billing are not implemented. |
| Backups, account recovery, error monitoring, analytics | Partial/not configured | Must configure managed database/storage backups, recovery process, Sentry/PostHog or equivalents with privacy-conscious settings. |
| Automated checks / CI / architecture notes | Server safety tests and web CI are included; mobile architecture and test plans are documented | A dedicated mobile CI job, successful Expo Android build and physical-device tests are still required. |
| Accuracy benchmark / 10–20 real users | Not completed | Prepare a synthetic/consented dataset, measure type/extraction/search/safety metrics and publish only measured results. Never invent accuracy figures. |
| Store release | Not completed | Generate your EAS project, signing/build, privacy disclosures, icon/screenshots and complete Play Store testing/review. |

## Release gate

**Do not upload real patients' records until** Supabase RLS and private Storage policies have been tested with two separate accounts, server rate limits and authentication are verified, current AI provider terms are checked, backups/deletion are exercised, all source/AI content is reviewed for safe behaviour, and an appropriately qualified privacy/security review has been completed.
