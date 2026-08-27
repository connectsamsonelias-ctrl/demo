import { withTransaction } from "@/lib/db/pool";
import { getWebhookVerifier } from "@/lib/payments/provider";
import { PAYMENT_CURRENCY } from "@/lib/payments/types";
import { recordAuditLog } from "@/lib/audit/log";
import type { LicenseRow } from "@/lib/db/types";

export interface WebhookProcessResult {
  /** false for a verified-but-irrelevant event (wrong type, or a duplicate delivery already processed) — still a 200 to Stripe either way. */
  handled: boolean;
}

/**
 * The only place a license is ever activated. Verifies the webhook
 * signature first (throws on failure — the route handler turns that into
 * a 400, never processes an unverified payload), then, for a paid
 * checkout.session.completed event, creates the transactions row and
 * flips the matching license pending_payment -> active in one
 * transaction. Never trusts a client-asserted "payment succeeded" —
 * this is the one and only trigger, per the spec's explicit security
 * rule and migration 009's own comment.
 */
export async function handlePaymentWebhook(rawBody: string, signatureHeader: string): Promise<WebhookProcessResult> {
  const event = getWebhookVerifier().constructWebhookEvent(rawBody, signatureHeader);

  if (event.type !== "checkout.session.completed" || !event.paid) {
    return { handled: false };
  }

  const activated = await withTransaction(async (client) => {
    const rows = await client.query<LicenseRow>("SELECT * FROM licenses WHERE id = $1 FOR UPDATE", [
      event.licenseId,
    ]);
    const license = rows.rows[0];
    // An unrecognized license id should never happen for a session this
    // app created, but a webhook must never 500 (Stripe retries a 5xx
    // forever) — treat it as nothing to do rather than an error.
    if (!license) return false;

    // Idempotency: Stripe redelivers webhooks, and this exact handler can
    // itself be re-invoked for the same event. A license already moved
    // past pending_payment (by a prior delivery, or anything else) must
    // never be re-activated or double-charged into a second transaction.
    if (license.status !== "pending_payment") return false;

    const termsSnapshot = license.terms_snapshot as Record<string, unknown>;
    const basePrice = Number(termsSnapshot.base_price);
    const creatorSharePercent = Number(termsSnapshot.creator_share_percent);
    const buyerAmountCents = event.amountTotalCents ?? Math.round(basePrice * 100);
    const creatorAmountCents = Math.round((buyerAmountCents * creatorSharePercent) / 100);
    const platformFeeCents = buyerAmountCents - creatorAmountCents;

    const txRows = await client.query<{ id: string }>(
      `INSERT INTO transactions
         (license_id, buyer_amount, platform_fee, creator_amount, currency, payment_provider, payment_reference, status)
       VALUES ($1, $2, $3, $4, $5, 'stripe', $6, 'succeeded')
       RETURNING id`,
      [
        license.id,
        (buyerAmountCents / 100).toFixed(2),
        (platformFeeCents / 100).toFixed(2),
        (creatorAmountCents / 100).toFixed(2),
        PAYMENT_CURRENCY.toUpperCase(),
        event.sessionId,
      ]
    );
    const transaction = txRows.rows[0]!;

    await client.query(
      "UPDATE licenses SET status = 'active', start_date = CURRENT_DATE WHERE id = $1",
      [license.id]
    );

    await recordAuditLog(
      {
        actorId: null,
        action: "transaction.create",
        entityType: "transactions",
        entityId: transaction.id,
        newState: {
          status: "succeeded",
          buyer_amount_cents: buyerAmountCents,
          platform_fee_cents: platformFeeCents,
          creator_amount_cents: creatorAmountCents,
        },
        metadata: { license_id: license.id, stripe_session_id: event.sessionId },
      },
      client
    );
    await recordAuditLog(
      {
        actorId: null,
        action: "license.activate",
        entityType: "licenses",
        entityId: license.id,
        oldState: { status: "pending_payment" },
        newState: { status: "active" },
        metadata: { transaction_id: transaction.id },
      },
      client
    );

    return true;
  });

  return { handled: activated };
}
