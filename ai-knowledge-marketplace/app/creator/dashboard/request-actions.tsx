"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setLoading(action);
    setError(null);
    const res = await fetch(`/api/creator/requests/${requestId}/${action}`, { method: "POST" });
    setLoading(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-1">
      <div className="flex gap-2">
        <button
          onClick={() => act("approve")}
          disabled={loading !== null}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          onClick={() => act("reject")}
          disabled={loading !== null}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
