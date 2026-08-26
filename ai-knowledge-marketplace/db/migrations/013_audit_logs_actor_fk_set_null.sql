-- Found by an integration test in Milestone 3: audit_logs.actor_id was
-- created (migration 002) with the default RESTRICT behavior, which
-- means a user row could never be deleted once it had any audit log
-- entry — including the "user.signup" entry every user gets on
-- creation. That's backwards: the audit trail must survive the actor
-- being removed (the column is already nullable for exactly this),
-- not block the removal.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL;
