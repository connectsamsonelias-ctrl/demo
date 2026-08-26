-- Milestone 1 scope only: enough schema for the role/permission system and
-- the auth abstraction to have something real to point at. The full data
-- model (content_items, licenses, transactions, audit_logs, etc.) is
-- built in Milestone 2 (Database foundation) and later milestones, per
-- docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- "visitor" is intentionally not a stored role: it describes an
-- unauthenticated request, not a row in `users`.
CREATE TYPE user_role AS ENUM ('creator', 'buyer', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users (role);
