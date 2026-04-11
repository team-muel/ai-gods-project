# Security Audit 2026-04-11

## Scope

- Reviewed repository RLS intent in db/supabase_setup_all.sql, db/supabase_apply_rls_policies.sql, db/supabase_add_virtual_warehouse.sql, db/supabase_add_reward_learning_tables.sql.
- Verified live Supabase access behavior with anon and service_role credentials.
- Reviewed API exposure against three risks from the vibe-coding security checklist:
  - RLS or direct database exposure
  - Missing backend rate limits
  - Sensitive API keys exposed to the frontend

## What Is Safe Now

- Production browser-side Supabase access is disabled in src/lib/supabase.js; the browser uses server APIs in production.
- Backend rate limits now exist on chat, search, transcript, debate write, memory lookup, Obsidian sync, and log endpoints.
- Groq is now documented and wired as a server-only secret via GROQ_API_KEY. VITE_GROQ_API_KEY remains only as a deprecated fallback for local compatibility.
- Live Supabase anon access is now blocked for the protected app tables covered by npm run audit:supabase-access.
- The tested private dataset object is not downloadable with anon credentials.

## Final Validation

Evidence from the latest npm run audit:supabase-access:

- anonTableReadSafe=true
- anonDatasetDownloadSafe=true
- anon readableTables=[]
- debates, debate_messages, god_memories, memory_links, neuro_logs, arousal_logs all return permission denied for anon

Additional live behavior:

- reward_events, preference_pairs, debate_archives, dataset_versions, training_runs, model_versions currently return PGRST205 through PostgREST schema cache paths
- immune_logs also returns PGRST205 because that table is not present in the live schema cache
- warehouse storage probe remained blocked to anon for the tested object path

This means the current live project no longer exposes the audited core app tables or tested dataset object to anonymous reads.

## Operational Conclusion

- Repository intent is secure.
- Live Supabase state now satisfies the audited confidentiality baseline for the protected tables checked in this report.
- The repository can be treated as main-candidate from the Supabase exposure perspective, subject to normal branch review and merge process.

## Remediation Applied

- The RLS hardening SQL was updated so optional tables missing from the live schema do not abort the entire change set.
- The RLS hardening SQL was then executed in the Supabase SQL Editor against the live project.
- A follow-up live audit confirmed that anon reads are blocked for the protected core tables and for the tested dataset object.

## Residual Notes

1. If any frontend build or deployment ever exposed the old VITE_GROQ_API_KEY, rotate the Groq key.
2. PGRST205 responses for optional tables indicate those resources are absent or not yet exposed through the PostgREST schema cache, not anonymously readable.
3. Future schema additions should re-run npm run audit:supabase-access after migration.

## Minimum Pass Criteria For Main

- anon cannot read any protected app table
- anon cannot download private training dataset objects
- backend rate limits remain enabled
- no sensitive provider secret uses a VITE_ prefix
- production secrets and budget caps are configured