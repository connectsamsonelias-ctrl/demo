-- Records the creator's ownership/authorization attestation at content
-- submission time (Milestone 6). Per the kickoff review, MVP scope is a
-- simple required checkbox, not platform-level verification — but the
-- record of exactly what was agreed to, and when, must be immutable and
-- auditable, same reasoning as licenses.terms_snapshot: if the shown
-- attestation wording changes later, historical submissions must still
-- show what the creator actually agreed to at the time.
--
-- Both columns are NOT NULL: application code (lib/creator/content.ts)
-- refuses to create a content_item without a true attestation, so every
-- row must carry proof of it.
ALTER TABLE content_items ADD COLUMN ownership_attested_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE content_items ADD COLUMN ownership_attestation_text TEXT NOT NULL DEFAULT '';
ALTER TABLE content_items ALTER COLUMN ownership_attested_at DROP DEFAULT;
ALTER TABLE content_items ALTER COLUMN ownership_attestation_text DROP DEFAULT;
