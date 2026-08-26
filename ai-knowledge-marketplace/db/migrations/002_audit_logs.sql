-- audit_logs is created in the foundation milestone (rather than deferred
-- to Milestone 2) because the audit-logging abstraction in lib/audit is a
-- required Milestone 1 deliverable and needs a real table to write to.
-- Every other domain table (content_items, licenses, transactions, ...)
-- is still deferred to Milestone 2 and beyond.

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL REFERENCES users (id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_state JSONB NULL,
  new_state JSONB NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
