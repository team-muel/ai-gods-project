-- AI Gods dossier layer
-- debate 결과를 report/PPT 입력물로 승격시키기 위한 구조화 저장소

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.debate_dossiers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id         uuid NOT NULL UNIQUE REFERENCES public.debates (id) ON DELETE CASCADE,
  topic             text NOT NULL,
  dossier_status    text NOT NULL DEFAULT 'needs_evidence',
  executive_summary text,
  markdown_content  text,
  structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_count    integer NOT NULL DEFAULT 0,
  claim_count       integer NOT NULL DEFAULT 0,
  action_item_count integer NOT NULL DEFAULT 0,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debate_dossiers_created_at ON public.debate_dossiers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debate_dossiers_status     ON public.debate_dossiers (dossier_status);

CREATE TABLE IF NOT EXISTS public.debate_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id           uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  evidence_type       text NOT NULL,
  source_kind         text NOT NULL,
  provider            text,
  source_url          text,
  external_id         text,
  title               text NOT NULL,
  excerpt             text,
  verification_status text NOT NULL DEFAULT 'unverified',
  mention_count       integer NOT NULL DEFAULT 1,
  mentioned_by        jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debate_evidence_debate_id   ON public.debate_evidence (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_evidence_source_kind ON public.debate_evidence (source_kind);
CREATE INDEX IF NOT EXISTS idx_debate_evidence_created_at  ON public.debate_evidence (created_at DESC);

CREATE TABLE IF NOT EXISTS public.debate_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id       uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  claim_key       text NOT NULL,
  owner_god_id    text,
  owner_god_name  text,
  round           integer NOT NULL DEFAULT 1,
  statement       text NOT NULL,
  evidence_status text NOT NULL DEFAULT 'missing',
  supporting_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_debate_claims_unique ON public.debate_claims (debate_id, claim_key);
CREATE INDEX IF NOT EXISTS idx_debate_claims_debate_id     ON public.debate_claims (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_claims_created_at    ON public.debate_claims (created_at DESC);

CREATE TABLE IF NOT EXISTS public.debate_artifacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id          uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  artifact_type      text NOT NULL,
  title              text NOT NULL,
  format             text NOT NULL DEFAULT 'markdown',
  status             text NOT NULL DEFAULT 'ready',
  content_markdown   text,
  structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debate_artifacts_debate_id    ON public.debate_artifacts (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_artifacts_type         ON public.debate_artifacts (artifact_type);
CREATE INDEX IF NOT EXISTS idx_debate_artifacts_created_at   ON public.debate_artifacts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.autonomous_topic_candidates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  rationale          text,
  focus_area         text,
  why_now            text,
  novelty_score      integer NOT NULL DEFAULT 0,
  urgency_score      integer NOT NULL DEFAULT 0,
  evidence_hint      text,
  recommended_output text,
  status             text NOT NULL DEFAULT 'proposed',
  source             text NOT NULL DEFAULT 'autonomous_topic_api',
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomous_topic_candidates_created_at ON public.autonomous_topic_candidates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_topic_candidates_status     ON public.autonomous_topic_candidates (status);

DROP TRIGGER IF EXISTS trg_debate_dossiers_updated_at ON public.debate_dossiers;
CREATE TRIGGER trg_debate_dossiers_updated_at
  BEFORE UPDATE ON public.debate_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.debate_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_topic_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_anon ON public.debate_dossiers;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_dossiers;
DROP POLICY IF EXISTS allow_all_anon ON public.debate_evidence;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_evidence;
DROP POLICY IF EXISTS allow_all_anon ON public.debate_claims;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_claims;
DROP POLICY IF EXISTS allow_all_anon ON public.debate_artifacts;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_artifacts;
DROP POLICY IF EXISTS allow_all_anon ON public.autonomous_topic_candidates;
DROP POLICY IF EXISTS allow_all_authenticated ON public.autonomous_topic_candidates;

REVOKE ALL ON TABLE public.debate_dossiers FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_evidence FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_artifacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.autonomous_topic_candidates FROM anon, authenticated;

COMMIT;