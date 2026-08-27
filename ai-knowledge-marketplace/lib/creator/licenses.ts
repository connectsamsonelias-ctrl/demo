import { query } from "@/lib/db/pool";
import { requireCreatorProfileId } from "@/lib/auth/ownership";
import type { Session } from "@/lib/auth/session";
import type { LicenseRow } from "@/lib/db/types";

export interface CreatorLicenseView extends LicenseRow {
  contentItemTitle: string;
  buyerOrganizationName: string;
}

/** Read-only. Licenses are created only via approveAccessRequest (lib/creator/requests.ts). */
export async function listLicensesForCreator(session: Session): Promise<CreatorLicenseView[]> {
  const creatorId = await requireCreatorProfileId(session);
  return query<CreatorLicenseView>(
    `SELECT l.*, ci.title AS "contentItemTitle", bp.organization_name AS "buyerOrganizationName"
     FROM licenses l
     JOIN content_items ci ON ci.id = l.content_item_id
     JOIN buyer_profiles bp ON bp.id = l.buyer_id
     WHERE l.creator_id = $1
     ORDER BY l.created_at DESC`,
    [creatorId]
  );
}
