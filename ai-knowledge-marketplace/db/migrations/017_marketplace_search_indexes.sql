-- Milestone 10: PostgreSQL full-text search + indexed filter fields, per
-- the spec's explicit "do not introduce Elasticsearch/OpenSearch
-- initially" (Section 10). FTS is over title+description only — the
-- creator-authored text on content_items — not knowledge_assets.summary
-- (AI-generated commentary in a separate, one-to-many-joined table,
-- which a simple expression index on content_items can't cover).
CREATE INDEX idx_content_items_fts ON content_items
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Supports the topic/skill filters and the spec's explicit "indexed
-- quality score" requirement.
CREATE INDEX idx_knowledge_assets_topics ON knowledge_assets USING GIN (topics);
CREATE INDEX idx_knowledge_assets_skills ON knowledge_assets USING GIN (skills);
CREATE INDEX idx_knowledge_assets_quality_score ON knowledge_assets (quality_score);
