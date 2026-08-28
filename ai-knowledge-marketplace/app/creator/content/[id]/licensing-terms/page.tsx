"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Screen C05. Same minimal pattern as the profile edit pages
 * (app/creator/profile/edit, app/buyer/profile/edit): a blank form that
 * PATCH-upserts, not a prefetch-and-prefill flow. creator_share_percent/
 * platform_share_percent are never shown here as editable fields — they
 * aren't client-settable at all (lib/licensing/commission.ts sets them
 * server-side).
 */
export default function LicensingTermsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [allowedUseTypesText, setAllowedUseTypesText] = useState("");
  const [licenseDuration, setLicenseDuration] = useState("");
  const [geographicScope, setGeographicScope] = useState("");
  const [commercialStatus, setCommercialStatus] = useState<"non_commercial" | "commercial">("non_commercial");
  const [pricingModel, setPricingModel] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/creator/content/${params.id}/licensing-terms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowedUseTypes: allowedUseTypesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        licenseDuration: licenseDuration || undefined,
        geographicScope: geographicScope || undefined,
        commercialStatus,
        pricingModel: pricingModel || undefined,
        basePrice: basePrice ? Number(basePrice) : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Something went wrong.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Licensing terms</h1>
      <p className="mt-1 text-sm text-slate-600">
        Set the commercial terms buyers will see before you can approve requests for this content.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Allowed use types (comma-separated)
          <input
            value={allowedUseTypesText}
            onChange={(e) => setAllowedUseTypesText(e.target.value)}
            placeholder="e.g. RAG dataset, fine-tuning, research"
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          License duration
          <input
            value={licenseDuration}
            onChange={(e) => setLicenseDuration(e.target.value)}
            placeholder="e.g. 1 year"
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Geographic scope
          <input
            value={geographicScope}
            onChange={(e) => setGeographicScope(e.target.value)}
            placeholder="e.g. worldwide"
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Commercial status
          <select
            value={commercialStatus}
            onChange={(e) => setCommercialStatus(e.target.value as "non_commercial" | "commercial")}
            className="rounded border border-slate-300 px-3 py-1.5"
          >
            <option value="non_commercial">Non-commercial</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Pricing model
          <input
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value)}
            placeholder="e.g. flat fee, per-use"
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Base price (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
