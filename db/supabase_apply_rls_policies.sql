-- Supabase RLS hardening for AI Gods tables
-- Run this in Supabase SQL Editor after schema creation.
-- Browser clients no longer access tables directly; server APIs use service_role.

BEGIN;

DROP POLICY IF EXISTS allow_all_anon ON public.debates;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debates;
DROP POLICY IF EXISTS allow_all_anon ON public.debate_messages;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_messages;
DROP POLICY IF EXISTS allow_all_anon ON public.god_memories;
DROP POLICY IF EXISTS allow_all_authenticated ON public.god_memories;
DROP POLICY IF EXISTS allow_all_anon ON public.memory_links;
DROP POLICY IF EXISTS allow_all_authenticated ON public.memory_links;
DROP POLICY IF EXISTS allow_all_anon ON public.neuro_logs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.neuro_logs;
DROP POLICY IF EXISTS allow_all_anon ON public.arousal_logs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.arousal_logs;
DROP POLICY IF EXISTS allow_all_anon ON public.immune_logs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.immune_logs;
DROP POLICY IF EXISTS allow_all_anon ON public.reward_events;
DROP POLICY IF EXISTS allow_all_authenticated ON public.reward_events;
DROP POLICY IF EXISTS allow_all_anon ON public.preference_pairs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.preference_pairs;
DROP POLICY IF EXISTS allow_all_anon ON public.debate_archives;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_archives;
DROP POLICY IF EXISTS allow_all_anon ON public.dataset_versions;
DROP POLICY IF EXISTS allow_all_authenticated ON public.dataset_versions;
DROP POLICY IF EXISTS allow_all_anon ON public.training_runs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.training_runs;
DROP POLICY IF EXISTS allow_all_anon ON public.model_versions;
DROP POLICY IF EXISTS allow_all_authenticated ON public.model_versions;
DROP POLICY IF EXISTS allow_insert_neuro_authenticated ON public.neuro_logs;
DROP POLICY IF EXISTS allow_select_neuro_authenticated ON public.neuro_logs;
DROP POLICY IF EXISTS allow_insert_arousal_authenticated ON public.arousal_logs;
DROP POLICY IF EXISTS allow_select_arousal_authenticated ON public.arousal_logs;

-- Keep RLS enabled with no direct client policies.
ALTER TABLE IF EXISTS public.neuro_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.arousal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.debate_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.god_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.memory_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.immune_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.preference_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.debate_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.training_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.model_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.debates FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.god_memories FROM anon, authenticated;
REVOKE ALL ON TABLE public.memory_links FROM anon, authenticated;
REVOKE ALL ON TABLE public.neuro_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.arousal_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.immune_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.reward_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.preference_pairs FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_archives FROM anon, authenticated;
REVOKE ALL ON TABLE public.dataset_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.training_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.model_versions FROM anon, authenticated;

COMMIT;

-- NOTES:
-- 1) 서버 API에서는 `service_role` 키를 사용하세요. 절대 브라우저에 노출하지 마세요.
-- 2) 브라우저에서 직접 읽기/쓰기가 필요하면 최소 권한 정책을 별도로 추가하세요.
