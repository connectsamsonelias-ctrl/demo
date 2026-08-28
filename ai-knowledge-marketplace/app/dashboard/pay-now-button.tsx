"use client";

import { useState } from "react";

export function PayNowButton({ licenseId }: { licenseId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/buyer/licenses/${licenseId}/checkout`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setLoading(false);
      setError(body?.error?.message ?? "Something went wrong.");
      return;
    }
    // Full navigation, not router.push — this is leaving the app for
    // Stripe's own hosted checkout page.
    window.location.href = body.checkoutUrl;
  }

  return (
    <div className="mt-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Pay now"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
