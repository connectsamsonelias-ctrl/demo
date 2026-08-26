-- Two independent status columns, matching the source spec's Section 8
-- (content_items has both `status` and `rights_status`) and Section 6
-- (A02 Content Review: approve/reject/suspend/clarify vs. A03 Rights
-- Review: authorization/permitted-use/withdrawal). They track different
-- things and must not be conflated:
--   moderation_status  — admin content-quality gate (Milestone 18, A02)
--   rights_status      — the legal rights state machine (Milestone 13)
--
-- rights_status enum values are exactly the 12 states from
-- docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md Step 4 / Engineering Spec
-- Section 7. Defining the enum here is schema-only; the transition-guard
-- functions that enforce which moves are legal belong to lib/rights
-- (Milestone 13), not this migration.
CREATE TYPE content_moderation_status AS ENUM (
  'draft', 'pending_review', 'approved', 'rejected', 'suspended'
);

CREATE TYPE rights_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'AUTHORIZATION_PENDING',
  'AUTHORIZED_FOR_PROCESSING',
  'ANALYSIS_COMPLETE',
  'LICENSING_ELIGIBLE',
  'LISTED',
  'LICENSE_REQUESTED',
  'LICENSED',
  'ACTIVE',
  'WITHDRAWN',
  'WITHDRAWAL_REQUESTED',
  'CONTRACTUAL_REVIEW',
  'SUSPENDED'
);

-- Design decision (not pinned down by the source spec): creator_id
-- references creator_profiles, not users directly — content, licenses
-- and access requests all belong to the creator/buyer *profile* entity,
-- consistent with how creator_profiles/buyer_profiles model those roles.
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creator_profiles (id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  status content_moderation_status NOT NULL DEFAULT 'draft',
  rights_status rights_status NOT NULL DEFAULT 'DRAFT',
  quality_score NUMERIC(5, 2) CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_items_creator_id ON content_items (creator_id);
CREATE INDEX idx_content_items_status ON content_items (status);
CREATE INDEX idx_content_items_rights_status ON content_items (rights_status);
CREATE INDEX idx_content_items_category ON content_items (category);
CREATE INDEX idx_content_items_language ON content_items (language);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
