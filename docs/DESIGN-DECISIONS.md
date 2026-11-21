# Design decisions

1. **Native Expo / React Native first.** The core user experience lives in `mobile/`, using device document picker, camera/photo import, biometric prompts, notifications, PDF printing/sharing and text-to-speech.
2. **Records, not medication adherence.** Daily dose tracking, streaks and the old body-map concept are omitted per the product plan.
3. **Review before save.** Document extraction fills a draft. Users must check it against the original; low/uncertain records can stay in Needs review.
4. **AI is a librarian, not a doctor.** Extraction is limited to document contents. Medical diagnosis/treatment questions are redirected to a clinician. Lab values remain as printed.
5. **Local-first storage with optional cloud sync.** Records can be reviewed offline after they are saved locally. This is not yet a conflict-safe/background sync engine.
6. **Server-only AI credential.** The Gemini key is used only by the Node API. The mobile app must never receive that key.
7. **Private per-user cloud records.** Supabase RLS and private Storage policies must be verified using separate accounts before real-user testing.
8. **Share by least disclosure.** A share view exposes a limited summary, not a raw original attachment. Its URL is a bearer link and must have an expiry and revocation path.
9. **Do not promise perfect handwriting recognition.** Low confidence, unclear text, OCR errors and the original file must remain visible to the user.
