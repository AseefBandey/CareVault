# CareVault Premium — implementation status and launch checklist

## What is included now

- Mobile Premium plans screen with monthly/yearly selection, feature list, restore-purchases placeholder, and a clear no-payment preview state.
- Suggested India pricing for product discussion only: ₹199/month or ₹1,499/year. These prices are not final or charged by this build.
- Supabase `user_subscriptions` table for server-verified subscription state. Authenticated clients can read only their own row; they cannot insert, update, or delete subscription entitlements.
- Supabase `usage_events` table for server-side quota accounting. Authenticated clients have no direct access.

## Not activated yet

No payment SDK, purchase, renewal, cancellation, refund, or restore flow is active. The Premium screen intentionally does not pretend a purchase succeeded. Premium feature descriptions depend on the related feature and external service being configured; selecting a plan does not unlock entitlements.

## Required before accepting money

1. Confirm pricing, free quotas, Premium quotas, trial policy, tax display, and cancellation terms.
2. Configure Google Play Billing and/or Apple StoreKit (or a compliant web payment provider for web distribution).
3. Verify purchases on a trusted backend. Never trust a plan/status sent by the client.
4. Add provider webhook handling for renewals, cancellations, grace periods, refunds, revocations, and expiry; use idempotency keys.
5. Write subscription rows using server credentials only. Never ship the Supabase service-role key in the mobile app.
6. Add server-side quota enforcement to AI/OCR, storage, sharing and smart search endpoints; record successful usage events.
7. Add billing terms, privacy disclosures, account deletion and subscription management links.
8. Test sandbox purchase, renewal, failed payment, cancellation, restore, refund and expired subscription on test accounts.
9. Check store rules and local consumer/privacy requirements before release.

## Product safety note

Medical records are highly sensitive. Do not launch cloud backups or AI processing for real patient data until access policies, provider data terms, retention/deletion, logging redaction, backups and incident response have been reviewed.
