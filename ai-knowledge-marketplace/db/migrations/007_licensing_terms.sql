-- A creator's stated licensing preferences for a content item (Screen C05).
-- This is the *default* commercial terms a creator sets, not the
-- immutable record of what a specific license/transaction actually paid
-- out — that snapshot lives on licenses.terms_snapshot and transactions,
-- per the spec's rule "never retroactively recalculate historical
-- transactions from current settings" (Section 14).
CREATE TABLE licensing_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL UNIQUE REFERENCES content_items (id) ON DELETE CASCADE,
  allowed_use_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  license_duration TEXT,
  geographic_scope TEXT,
  commercial_status TEXT NOT NULL DEFAULT 'non_commercial',
  pricing_model TEXT,
  base_price NUMERIC(12, 2) CHECK (base_price IS NULL OR base_price >= 0),
  creator_share_percent NUMERIC(5, 2) NOT NULL CHECK (creator_share_percent >= 0 AND creator_share_percent <= 100),
  platform_share_percent NUMERIC(5, 2) NOT NULL CHECK (platform_share_percent >= 0 AND platform_share_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shares_sum_to_100 CHECK (creator_share_percent + platform_share_percent = 100)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON licensing_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
