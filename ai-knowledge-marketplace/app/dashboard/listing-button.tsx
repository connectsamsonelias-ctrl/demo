"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ListingButton({ contentItemId, mode }: { contentItemId: string; mode: "list" | "unlist" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/creator/content/${contentItemId}/listing`, {
      method: mode === "list" ? "POST" : "DELETE",
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        {loading ? "Working…" : mode === "list" ? "List on Marketplace" : "Unlist"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
