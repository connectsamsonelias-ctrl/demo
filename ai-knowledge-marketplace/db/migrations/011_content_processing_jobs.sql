-- job_type is intentionally TEXT, not an enum: the AI pipeline's tiers
-- (Section 12/13 of the spec — metadata, transcript/topic extraction,
-- deep knowledge extraction, ...) are still expected to evolve in
-- Milestone 7, and a new tier shouldn't require a migration.
CREATE TYPE processing_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE content_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status processing_job_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_content_processing_jobs_content_item_id ON content_processing_jobs (content_item_id);
-- The Milestone 7 polling worker's core query is "find queued work";
-- this index is what makes that query cheap as job volume grows.
CREATE INDEX idx_content_processing_jobs_status ON content_processing_jobs (status);
