# lib/rights

Reserved for the rights state machine (Milestone 13: Rights management).

Will own: the `rights_status` enum and transition-guard functions
(`DRAFT → SUBMITTED → AUTHORIZATION_PENDING → ... → ACTIVE`, plus the
`WITHDRAWN`/`SUSPENDED` branches) described in
`docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md`. Not implemented yet —
intentionally out of scope for Milestone 1.
