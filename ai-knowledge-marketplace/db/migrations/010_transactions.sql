-- status values are an engineering default (not specified in the source
-- spec), modeled on a typical webhook-driven payment lifecycle.
CREATE TYPE transaction_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES licenses (id) ON DELETE RESTRICT,
  buyer_amount NUMERIC(12, 2) NOT NULL CHECK (buyer_amount >= 0),
  platform_fee NUMERIC(12, 2) NOT NULL CHECK (platform_fee >= 0),
  creator_amount NUMERIC(12, 2) NOT NULL CHECK (creator_amount >= 0),
  currency CHAR(3) NOT NULL,
  payment_provider TEXT NOT NULL,
  payment_reference TEXT,
  status transaction_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Financial integrity backstop: the commission split must always
  -- account for the full buyer payment. This is exactly the kind of
  -- correctness rule that must never depend on application code alone.
  CONSTRAINT amounts_reconcile CHECK (buyer_amount = platform_fee + creator_amount)
);

CREATE INDEX idx_transactions_license_id ON transactions (license_id);
CREATE INDEX idx_transactions_status ON transactions (status);
-- payment_reference (the provider's charge/session id) is how a webhook
-- is matched back to a transaction and must be unique once set; NULL is
-- allowed only before a provider reference exists (status = 'pending').
CREATE UNIQUE INDEX idx_transactions_payment_reference ON transactions (payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
