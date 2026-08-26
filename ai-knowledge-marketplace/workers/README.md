# workers

Reserved for background job workers (content processing, AI audit,
notifications) starting at Milestone 7. Milestone 1 only establishes the
job-record pattern intent (see docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md
— background jobs run via a `content_processing_jobs` table + polling
worker, no external queue broker). No workers exist yet.
