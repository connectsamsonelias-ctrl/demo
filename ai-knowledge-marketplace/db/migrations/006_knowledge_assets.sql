CREATE TABLE knowledge_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  summary TEXT,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  structured_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_score NUMERIC(5, 2) CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_assets_content_item_id ON knowledge_assets (content_item_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON knowledge_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
