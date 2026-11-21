# CareVault Mobile (Expo / React Native)

Android-first personal medical-records vault. Demo login is `test` / `test`; demo records are synthetic and local-only. Do not use demo mode for real medical records.

## Run locally on Fedora

```bash
npm install
npx expo install --fix
npx expo-doctor@latest
npx expo start --clear
```

Scan the QR code with Expo Go only if your installed Expo Go version supports this project's Expo SDK. Otherwise build an APK with EAS:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

## Configuration

Copy `.env.example` to `.env` only when configuring the real backend. `EXPO_PUBLIC_*` values are bundled into the client and must never contain private server secrets. The Gemini API key belongs on the server only. Physical Android devices cannot reach the development computer using `localhost`; use the computer's LAN IP or a deployed HTTPS API URL.

See `../FINAL-SETUP-GUIDE.md` and `../MOBILE-IMPLEMENTATION-STATUS.md` for setup and known gaps.
