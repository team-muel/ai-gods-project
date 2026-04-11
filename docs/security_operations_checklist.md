# Security Operations Checklist

## 1. Pre-Deploy Gates

- Use GROQ_API_KEY, never VITE_GROQ_API_KEY, for any real provider secret.
- Keep SUPABASE_SERVICE_ROLE_KEY server-side only.
- Confirm browser production path does not directly read or write private Supabase tables.
- Run npm run build.
- Run npm run audit:supabase-access.
- Confirm outputs/supabase-access-audit.json reports anonTableReadSafe=true.

## 2. Supabase Database And Storage

- Apply db/supabase_apply_rls_policies.sql to the live project.
- Revoke anon and authenticated direct table access unless a table has a narrowly scoped business reason.
- Verify that user-editable tables do not also store billing, entitlement, or quota state.
- Keep debate-archives and training-datasets buckets private.
- Re-test anon access after every schema migration.

## 3. Backend Rate Limits

- Keep per-route backend rate limits enabled for chat, search, transcript, debate completion, feedback, logs, and admin-style dashboards.
- Prefer user-based limits when authenticated identity exists.
- Add IP-based fallback limits for unauthenticated traffic.
- Monitor 429 volume so that abuse and misconfigured clients are visible.

## 4. Sensitive API Boundaries

- Call AI provider APIs only from backend code.
- Call billing, email, storage, and model-publishing APIs only from backend code.
- Never treat frontend or mobile environment variables as secret.
- Rotate any secret that was ever shipped to a client bundle.

## 5. Budget And Spend Limits

- Configure Groq budget alerts and hard spend caps if available.
- Configure Supabase spend alerts for database, storage, and egress.
- Configure Vercel usage and spend alerts for serverless execution and bandwidth.
- Configure GitHub Actions usage alerts if retraining or automation expands.
- Prefer service interruption over unlimited spend exposure.

## 6. Release Checklist

- Verify anon cannot read protected tables.
- Verify private dataset objects are not downloadable with anon.
- Verify deployment uses GROQ_API_KEY, not deprecated VITE_GROQ_API_KEY.
- Verify rate-limited APIs return 429 when abused.
- Verify warehouse buckets remain private after deployment.

## 7. Incident Response

- Revoke and rotate exposed provider keys immediately.
- Pause or lower provider spending limits.
- Disable affected routes if abuse is active.
- Re-run npm run audit:supabase-access after the fix.
- Document the root cause in the next security audit note.