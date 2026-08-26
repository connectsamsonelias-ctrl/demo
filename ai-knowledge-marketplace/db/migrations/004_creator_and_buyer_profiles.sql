-- verification_status is shared by creator_profiles and buyer_profiles:
-- neither is auto-verified. Values chosen here (unverified/pending/
-- verified/rejected) are an engineering default, not specified in the
-- source spec — revisit if the verification workflow (Milestone 5/11)
-- needs more states.
CREATE TYPE verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');

CREATE TABLE creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT,
  expertise JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON creator_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  industry TEXT,
  use_case TEXT,
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON buyer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A user's role (users.role) determines which profile table it may have a
-- row in; enforced in application code at profile-creation time (Milestone
-- 5/11), since a cross-table CHECK against another table isn't expressible
-- as a plain constraint here.
