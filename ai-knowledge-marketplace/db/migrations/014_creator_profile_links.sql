-- Screen C02 (Creator Profile) lists a "Links" field (portfolio/social
-- URLs) that migration 004 didn't include a column for.
ALTER TABLE creator_profiles ADD COLUMN links JSONB NOT NULL DEFAULT '[]'::jsonb;
