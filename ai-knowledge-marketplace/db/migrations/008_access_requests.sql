-- status values are an engineering default (not specified in the source
-- spec): pending → approved|rejected, or withdrawn by the buyer before a
-- decision. Revisit if the approval workflow (Milestone 12) needs more.
CREATE TYPE access_request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TABLE access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyer_profiles (id) ON DELETE CASCADE,
  intended_use TEXT NOT NULL,
  requested_scope TEXT NOT NULL,
  requested_duration TEXT,
  status access_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_requests_content_item_id ON access_requests (content_item_id);
CREATE INDEX idx_access_requests_buyer_id ON access_requests (buyer_id);
CREATE INDEX idx_access_requests_status ON access_requests (status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON access_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
