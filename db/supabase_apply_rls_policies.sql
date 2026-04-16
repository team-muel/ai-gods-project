-- Supabase RLS hardening for AI Gods tables
-- Run this in Supabase SQL Editor after schema creation.
-- Browser clients no longer access tables directly; server APIs use service_role.

BEGIN;

DO $$
BEGIN
	IF to_regclass('public.debates') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debates';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debates';
		EXECUTE 'ALTER TABLE public.debates ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debates FROM anon, authenticated';
	END IF;

	IF to_regclass('public.debate_messages') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debate_messages';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_messages';
		EXECUTE 'ALTER TABLE public.debate_messages ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debate_messages FROM anon, authenticated';
	END IF;

	IF to_regclass('public.god_memories') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.god_memories';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.god_memories';
		EXECUTE 'ALTER TABLE public.god_memories ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.god_memories FROM anon, authenticated';
	END IF;

	IF to_regclass('public.memory_links') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.memory_links';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.memory_links';
		EXECUTE 'ALTER TABLE public.memory_links ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.memory_links FROM anon, authenticated';
	END IF;

	IF to_regclass('public.neuro_logs') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.neuro_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.neuro_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_insert_neuro_authenticated ON public.neuro_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_select_neuro_authenticated ON public.neuro_logs';
		EXECUTE 'ALTER TABLE public.neuro_logs ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.neuro_logs FROM anon, authenticated';
	END IF;

	IF to_regclass('public.arousal_logs') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.arousal_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.arousal_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_insert_arousal_authenticated ON public.arousal_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_select_arousal_authenticated ON public.arousal_logs';
		EXECUTE 'ALTER TABLE public.arousal_logs ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.arousal_logs FROM anon, authenticated';
	END IF;

	IF to_regclass('public.immune_logs') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.immune_logs';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.immune_logs';
		EXECUTE 'ALTER TABLE public.immune_logs ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.immune_logs FROM anon, authenticated';
	END IF;

	IF to_regclass('public.reward_events') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.reward_events';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.reward_events';
		EXECUTE 'ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.reward_events FROM anon, authenticated';
	END IF;

	IF to_regclass('public.preference_pairs') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.preference_pairs';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.preference_pairs';
		EXECUTE 'ALTER TABLE public.preference_pairs ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.preference_pairs FROM anon, authenticated';
	END IF;

	IF to_regclass('public.debate_dossiers') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debate_dossiers';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_dossiers';
		EXECUTE 'ALTER TABLE public.debate_dossiers ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debate_dossiers FROM anon, authenticated';
	END IF;

	IF to_regclass('public.debate_evidence') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debate_evidence';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_evidence';
		EXECUTE 'ALTER TABLE public.debate_evidence ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debate_evidence FROM anon, authenticated';
	END IF;

	IF to_regclass('public.debate_claims') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debate_claims';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_claims';
		EXECUTE 'ALTER TABLE public.debate_claims ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debate_claims FROM anon, authenticated';
	END IF;

	IF to_regclass('public.debate_artifacts') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debate_artifacts';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_artifacts';
		EXECUTE 'ALTER TABLE public.debate_artifacts ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debate_artifacts FROM anon, authenticated';
	END IF;

	IF to_regclass('public.autonomous_topic_candidates') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.autonomous_topic_candidates';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.autonomous_topic_candidates';
		EXECUTE 'ALTER TABLE public.autonomous_topic_candidates ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.autonomous_topic_candidates FROM anon, authenticated';
	END IF;

	IF to_regclass('public.debate_archives') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.debate_archives';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_archives';
		EXECUTE 'ALTER TABLE public.debate_archives ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.debate_archives FROM anon, authenticated';
	END IF;

	IF to_regclass('public.dataset_versions') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.dataset_versions';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.dataset_versions';
		EXECUTE 'ALTER TABLE public.dataset_versions ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.dataset_versions FROM anon, authenticated';
	END IF;

	IF to_regclass('public.training_runs') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.training_runs';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.training_runs';
		EXECUTE 'ALTER TABLE public.training_runs ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.training_runs FROM anon, authenticated';
	END IF;

	IF to_regclass('public.model_versions') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS allow_all_anon ON public.model_versions';
		EXECUTE 'DROP POLICY IF EXISTS allow_all_authenticated ON public.model_versions';
		EXECUTE 'ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY';
		EXECUTE 'REVOKE ALL ON TABLE public.model_versions FROM anon, authenticated';
	END IF;
END $$;

COMMIT;

-- NOTES:
-- 1) 서버 API에서는 `service_role` 키를 사용하세요. 절대 브라우저에 노출하지 마세요.
-- 2) 브라우저에서 직접 읽기/쓰기가 필요하면 최소 권한 정책을 별도로 추가하세요.
