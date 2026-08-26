-- Found while implementing Milestone 7: the table has no created_at, and
-- id is a random UUID (not time-ordered), so "the latest job for this
-- content item" had no reliable column to sort by — status='queued' jobs
-- have a NULL started_at too. queued_at is set the moment a job is
-- inserted and never changes afterward.
ALTER TABLE content_processing_jobs ADD COLUMN queued_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_content_processing_jobs_queued_at ON content_processing_jobs (queued_at);
