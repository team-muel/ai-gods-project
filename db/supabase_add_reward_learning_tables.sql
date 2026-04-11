-- ============================================================
-- AI Gods — Reward Learning Tables Incremental Migration
-- 기존 Supabase 스키마에 reward_events / preference_pairs 를 추가할 때 사용
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.reward_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id    uuid REFERENCES public.debates (id) ON DELETE CASCADE,
  god_id       text,
  event_type   text NOT NULL,
  reward_score double precision NOT NULL DEFAULT 0.0,
  reward_label text,
  source       text NOT NULL DEFAULT 'system',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_events_debate_id  ON public.reward_events (debate_id);
CREATE INDEX IF NOT EXISTS idx_reward_events_god_id     ON public.reward_events (god_id);
CREATE INDEX IF NOT EXISTS idx_reward_events_created_at ON public.reward_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.preference_pairs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id      uuid REFERENCES public.debates (id) ON DELETE CASCADE,
  god_id         text NOT NULL,
  topic          text NOT NULL,
  prompt         text NOT NULL,
  chosen         text NOT NULL,
  rejected       text NOT NULL,
  chosen_round   integer,
  rejected_round integer,
  reward_score   double precision NOT NULL DEFAULT 0.0,
  status         text NOT NULL DEFAULT 'ready',
  source         text NOT NULL DEFAULT 'auto_debate_reward',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preference_pairs_debate_id  ON public.preference_pairs (debate_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_god_id     ON public.preference_pairs (god_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_status     ON public.preference_pairs (status);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_created_at ON public.preference_pairs (created_at DESC);

ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_anon ON public.reward_events;
DROP POLICY IF EXISTS allow_all_authenticated ON public.reward_events;
DROP POLICY IF EXISTS allow_all_anon ON public.preference_pairs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.preference_pairs;

REVOKE ALL ON TABLE public.reward_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.preference_pairs FROM anon, authenticated;