-- Nullable: a user row can exist without a password (e.g. a future
-- OAuth-only account, or an admin-provisioned account before its owner
-- sets one). Credentials-based login treats a NULL password_hash as
-- "cannot log in via password" rather than an error.
ALTER TABLE users ADD COLUMN password_hash TEXT;
