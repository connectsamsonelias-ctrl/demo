-- status values are an engineering default (not specified in the source
-- spec). "pending_payment" covers the gap between a buyer accepting terms
-- and the payment webhook confirming (Milestone 15 rule: never activate on
-- a client-asserted "payment succeeded" — the license waits here until a
-- verified webhook flips it to active).
CREATE TYPE license_status AS ENUM ('pending_payment', 'active', 'expired', 'terminated');

CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items (id) ON DELETE RESTRICT,
  creator_id UUID NOT NULL REFERENCES creator_profiles (id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES buyer_profiles (id) ON DELETE RESTRICT,
  access_request_id UUID NOT NULL UNIQUE REFERENCES access_requests (id) ON DELETE RESTRICT,
  license_type TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  -- Immutable copy of the commercial terms in effect when this license was
  -- created (allowed use types, duration, geographic scope, price, share
  -- percentages, etc.) — never re-derive historical terms by joining back
  -- to licensing_terms, whose values can change after the fact.
  terms_snapshot JSONB NOT NULL,
  status license_status NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT license_dates_valid CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- content_item_id/creator_id/buyer_id use ON DELETE RESTRICT (not CASCADE):
-- an existing license must never be silently destroyed by deleting its
-- content item, creator, or buyer profile. This is also the schema-level
-- backstop for the spec's rule that withdrawal must never silently
-- invalidate an active contractual license.
CREATE INDEX idx_licenses_content_item_id ON licenses (content_item_id);
CREATE INDEX idx_licenses_creator_id ON licenses (creator_id);
CREATE INDEX idx_licenses_buyer_id ON licenses (buyer_id);
CREATE INDEX idx_licenses_status ON licenses (status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
