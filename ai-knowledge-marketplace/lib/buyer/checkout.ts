import { query } from "@/lib/db/pool";
import { assertOwnsLicenseAsBuyer } from "@/lib/auth/ownership";
import { getCheckoutProvider } from "@/lib/payments/provider";
import { ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { LicenseRow } from "@/lib/db/types";
import type { CheckoutSessionResult } from "@/lib/payments/types";

export interface StartCheckoutInput {
  /** Server-computed, never taken from the client — see the API route. Redirect targets after Stripe Checkout. */
  successUrl: string;
  cancelUrl: string;
}

/**
 * Starts a real Stripe Checkout session for a license the buyer already
 * holds (created at approval time, Milestone 14). The amount charged
 * comes from the license's own frozen terms_snapshot.base_price — never
 * re-read from the content's current licensing_terms, which can have
 * changed since this license was created (spec Section 14's "never
 * retroactively recalculate" rule).
 */
export async function startCheckoutForLicense(
  session: Session,
  licenseId: string,
  input: StartCheckoutInput
): Promise<CheckoutSessionResult> {
  await assertOwnsLicenseAsBuyer(session, licenseId);

  const rows = await query<LicenseRow & { contentItemTitle: string }>(
    `SELECT l.*, ci.title AS "contentItemTitle"
     FROM licenses l
     JOIN content_items ci ON ci.id = l.content_item_id
     WHERE l.id = $1`,
    [licenseId]
  );
  const license = rows[0];
  if (!license) throw new NotFoundError("License not found"); // assertOwnsLicenseAsBuyer already confirmed this

  if (license.status !== "pending_payment") {
    throw new ValidationError(
      `Cannot start checkout for a license in status '${license.status}' — only 'pending_payment' licenses can be paid.`
    );
  }

  const basePriceRaw = (license.terms_snapshot as Record<string, unknown>).base_price;
  const basePrice = typeof basePriceRaw === "string" || typeof basePriceRaw === "number" ? Number(basePriceRaw) : NaN;
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new ValidationError("This license has no price set — nothing to pay.");
  }

  return getCheckoutProvider().createCheckoutSession({
    licenseId: license.id,
    amountCents: Math.round(basePrice * 100),
    productName: license.contentItemTitle,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });
}
