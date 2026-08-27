import { query } from "@/lib/db/pool";
import { requireBuyerProfileId } from "@/lib/auth/ownership";
import type { Session } from "@/lib/auth/session";
import type { LicenseRow } from "@/lib/db/types";

export interface BuyerLicenseView extends LicenseRow {
  contentItemTitle: string;
}

/** Read-only. Licenses are created only via approveAccessRequest (lib/creator/requests.ts). */
export async function listLicensesForBuyer(session: Session): Promise<BuyerLicenseView[]> {
  const buyerId = await requireBuyerProfileId(session);
  return query<BuyerLicenseView>(
    `SELECT l.*, ci.title AS "contentItemTitle"
     FROM licenses l
     JOIN content_items ci ON ci.id = l.content_item_id
     WHERE l.buyer_id = $1
     ORDER BY l.created_at DESC`,
    [buyerId]
  );
}
