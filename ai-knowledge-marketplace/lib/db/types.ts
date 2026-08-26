/**
 * Row types mirroring db/migrations/*.sql. Kept hand-written and in sync
 * manually (no ORM/codegen — see README "Design choices"). If a query
 * shape and this file drift, the migration is the source of truth.
 */
import type { Role } from "@/lib/auth/roles";

export type UserStatus = "active" | "suspended";

export interface UserRow {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export interface CreatorProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  bio: string | null;
  expertise: unknown[];
  languages: unknown[];
  links: unknown[];
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
}

export interface BuyerProfileRow {
  id: string;
  user_id: string;
  organization_name: string;
  organization_type: string;
  industry: string | null;
  use_case: string | null;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
}

export type ContentModerationStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended";

/** The 12+2-state rights machine (Milestone 13 owns the transition guards). */
export type RightsStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTHORIZATION_PENDING"
  | "AUTHORIZED_FOR_PROCESSING"
  | "ANALYSIS_COMPLETE"
  | "LICENSING_ELIGIBLE"
  | "LISTED"
  | "LICENSE_REQUESTED"
  | "LICENSED"
  | "ACTIVE"
  | "WITHDRAWN"
  | "WITHDRAWAL_REQUESTED"
  | "CONTRACTUAL_REVIEW"
  | "SUSPENDED";

export interface ContentItemRow {
  id: string;
  creator_id: string;
  source_url: string;
  source_platform: string;
  title: string;
  description: string | null;
  language: string;
  category: string;
  status: ContentModerationStatus;
  rights_status: RightsStatus;
  quality_score: string | null; // NUMERIC comes back as string from `pg`
  ownership_attested_at: string;
  ownership_attestation_text: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeAssetRow {
  id: string;
  content_item_id: string;
  asset_type: string;
  summary: string | null;
  topics: unknown[];
  skills: unknown[];
  entities: unknown[];
  structured_content: Record<string, unknown>;
  provenance: Record<string, unknown>;
  quality_score: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicensingTermsRow {
  id: string;
  content_item_id: string;
  allowed_use_types: unknown[];
  license_duration: string | null;
  geographic_scope: string | null;
  commercial_status: string;
  pricing_model: string | null;
  base_price: string | null;
  creator_share_percent: string;
  platform_share_percent: string;
  created_at: string;
  updated_at: string;
}

export type AccessRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface AccessRequestRow {
  id: string;
  content_item_id: string;
  buyer_id: string;
  intended_use: string;
  requested_scope: string;
  requested_duration: string | null;
  status: AccessRequestStatus;
  created_at: string;
  updated_at: string;
}

export type LicenseStatus = "pending_payment" | "active" | "expired" | "terminated";

export interface LicenseRow {
  id: string;
  content_item_id: string;
  creator_id: string;
  buyer_id: string;
  access_request_id: string;
  license_type: string;
  start_date: string | null;
  end_date: string | null;
  terms_snapshot: Record<string, unknown>;
  status: LicenseStatus;
  created_at: string;
  updated_at: string;
}

export type TransactionStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface TransactionRow {
  id: string;
  license_id: string;
  buyer_amount: string;
  platform_fee: string;
  creator_amount: string;
  currency: string;
  payment_provider: string;
  payment_reference: string | null;
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type ProcessingJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface ContentProcessingJobRow {
  id: string;
  content_item_id: string;
  job_type: string;
  status: ProcessingJobStatus;
  attempts: number;
  error_message: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}
