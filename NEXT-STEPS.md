# CareVault mobile — your exact next steps

This file is the practical setup checklist for the project. Follow it in order. Do not upload real patient records during the demo phase.

## Stage 1 — get the app onto your Android phone

### A. Extract the project

Extract the CareVault ZIP into `~/Downloads/carevault-mobile-android-source/`. Open a terminal in that extracted project folder (the folder containing the root `README.md` and `package.json`).

Confirm Node/npm:

```bash
node --version
npm --version
```

Node 22.22.x is suitable for this project.

### B. Install mobile dependencies and run diagnostics

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor
```

Resolve any errors reported by `expo-doctor` before making a release build. An internet connection is needed to install packages.

### C. Build the Android preview APK

The project uses Expo SDK 58 for its native multi-page document scanner. If Expo Go installed on your phone does not support SDK 58 yet, do not downgrade packages at random. Use an EAS preview APK:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

Create an Expo account if prompted. Follow the prompts to link this app to that account. When EAS finishes, open the APK download link on your Android phone, allow installation from that source when Android asks, and install CareVault.

**Demo credentials:** username `test`, password `test`.

This demo uses synthetic sample records. It does not require Supabase or a Gemini key, and it must not be used for real medical data. The APK build itself has not been run from this development environment; successful install and device tests are your first validation step.

## Stage 2 — configure real accounts, database and cloud files

Only do this after the demo UI opens successfully.

1. Create a new Supabase project.
2. In the Supabase SQL Editor, run the complete `supabase/schema.sql` file from this repository against that project.
3. In Supabase Auth, enable Google OAuth and/or Phone OTP. Configure Google credentials/redirect URLs for OAuth. Phone OTP also needs an SMS provider configured in Supabase.
4. In the repository root, copy `.env.example` to `.env` and set the real `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, and other server values shown in the file. Keep `GEMINI_API_KEY` on the Node server only; never use an `EXPO_PUBLIC_` variable for it.
5. Start the API from the repository root in another terminal:

   ```bash
   npm ci
   npm run server
   ```

6. In `mobile/`, copy `.env.example` to `.env`. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
7. If testing on a real phone, set `EXPO_PUBLIC_API_BASE_URL` to your laptop's LAN IP, for example `http://192.168.1.10:8787/api`. Get the Fedora LAN IP with `hostname -I`. Do not use `localhost` as the phone's API address. Allow port 8787 through the laptop firewall only on your trusted private network if needed.
8. Restart Expo/build the app after changing the mobile environment variables. Public expiring-share links require deploying the API behind HTTPS and setting `EXPO_PUBLIC_PUBLIC_APP_URL` to the public API base URL.

Use synthetic records and two separate test accounts to verify that users cannot access each other's records before uploading real medical data.

## Stage 3 — required engineering and product work before real users

Read `MOBILE-IMPLEMENTATION-STATUS.md`. Important incomplete items include:

- Full OCR quality for handwriting/multiple languages, content-enhancement editing, mixed-document splitting and a proper `Needs review` confidence pipeline.
- Semantic search, extensive typo/brand-generic matching, opening the exact source page with highlighted text and grounded AI Q&A with page citations.
- Trusted medication-reference integration, full UI translations and voice search.
- Importing files *into* CareVault from arbitrary apps through the Android share sheet.
- Robust offline/background sync and conflict resolution; verified encrypted local-file storage; secure family invitations/roles.
- A real emergency card from the Android lock-screen/emergency screen, billing/Free-Pro enforcement, backups/recovery, monitoring and operational quotas.
- A security/privacy review, accurate privacy/terms and DPDP Act review, account-isolation and delete-everything tests, and a labelled synthetic/consented benchmark with real measured results.

The code has only received static source/config checks and the four existing server safety tests in this environment. A successful Expo dependency install, mobile TypeScript check, Android APK build and physical-device test are still required. Do not treat this code as production-ready for medical records until those gates pass.

## Stage 4 — release preparation

After the mobile build and tests pass, prepare store screenshots/icons, privacy disclosures, support contact/FAQ, legal review, app-signing and Play Store internal testing. Start with a small group using synthetic or properly consented data, collect bugs, measure extraction/search/safety accuracy, and publish only actual measured numbers.
