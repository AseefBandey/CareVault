# CareVault final handoff guide

## What is in this repository

- `mobile/`: Expo / React Native Android-first app source.
- `server/`: Node API and AI safety helpers/tests.
- `supabase/schema.sql`: database schema, indexes and row-level security policies.
- `.env.example` and `mobile/.env.example`: configuration templates. They contain no credentials.
- `docs/`: architecture, design decisions and test plan.
- `Medical Records Vault Final Project Plan.md`: the product specification supplied by the project owner.

## Demo mode

Use username `test` and password `test` in the mobile app. Demo mode is local-only and uses synthetic sample records. It is not real authentication, not a cloud account, and not appropriate for real medical records. Demo AI extraction is deliberately disabled.

## Run on Fedora

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor@latest
npx expo start --clear
```

Use Expo Go only if the installed Expo Go app supports this project's SDK. If not, build a development/preview APK with EAS (commands below).

## Build Android APK

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

EAS builds in the cloud. Download the APK from the build page and install it on your Android phone. The APK has not been built or device-tested by this handoff; run the diagnostics above and fix any SDK/plugin issues first.

## Backend setup to do later

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor and inspect any SQL errors.
3. Enable Google sign-in and/or phone OTP. Phone OTP requires an SMS provider.
4. Copy `.env.example` to `.env` at the repository root and fill server-only values, including `GEMINI_API_KEY`. Never commit `.env` or expose this key in any `EXPO_PUBLIC_` or `VITE_` variable.
5. Copy `mobile/.env.example` to `mobile/.env`. Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. For a physical phone, `EXPO_PUBLIC_API_BASE_URL` must use the laptop/server LAN IP or deployed HTTPS URL, not `localhost`.
6. Run the server from the repository root using its documented npm script (check root `package.json`), and restart Expo after environment changes.
7. Test with two separate accounts and synthetic documents. Confirm row-level security, storage access, deletion and share expiry before any real medical data is used.

## Product and safety boundary

CareVault is a record organiser, not a diagnostic or treatment app. It must not diagnose, tell users to start/stop/change medication, or label a lab result normal/abnormal. Verify extracted fields against originals. The app and server are not production-certified by this source delivery.

## Before real users

- Run `npx expo-doctor@latest`, type-check, server safety tests and production build.
- Build and test on a physical Android device; test offline/online transitions, file access, notification permissions, biometric flows and screen-reader navigation.
- Perform security review of authentication, Supabase RLS/storage policies, signed share links, expiry/revocation, rate limiting, logging and deletion.
- Review India's DPDP Act obligations, privacy policy, terms and AI provider data terms with qualified counsel.
- Create a synthetic evaluation set and publish measured classification, extraction, retrieval, citation and safety results. Never invent accuracy numbers.

## Honest implementation status

This repository is an MVP foundation, not a claim that every item in the plan is production-complete. See `MOBILE-IMPLEMENTATION-STATUS.md` for a feature-by-feature gap list. External account setup, device tests, trusted-source integrations, robust OCR/handwriting, semantic search, offline sync and legal/security validation require further work.
