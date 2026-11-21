# CareVault architecture

```mermaid
flowchart TD
  U[Person using Android app] --> M[Expo / React Native client]
  M --> L[App-private local cache and files]
  M --> A[Supabase Auth]
  M --> D[Supabase Postgres with row-level security]
  M --> S[Private Supabase Storage]
  M --> API[CareVault Node API]
  API -->|validates user access token| A
  API --> AI[Gemini API using server-only key]
  API --> DB[Supabase RPC for share view]
  DB --> D
  M --> N[Local notifications and device biometrics]
```

## Trust boundaries

- Expo `EXPO_PUBLIC_*` values are delivered to the client. Only Supabase URL and a publishable/anon key belong there; no service-role or AI secret belongs there.
- Supabase row-level security and private Storage policies are the server-side data boundary. Client UI filters are not access controls.
- AI extraction receives only the selected file after a consent prompt and a signed-in session. It returns an editable draft; never treat extraction as verified facts.
- Share URLs are bearer credentials. Use HTTPS, short expiry, revocation and minimal fields. Anyone with the link can see its permitted fields until expiration/revocation.
- The local cache is app-private, but the current build is **not end-to-end encrypted** with a user-held key.
