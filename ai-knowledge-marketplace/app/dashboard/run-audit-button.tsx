"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunAuditButton({ contentItemId }: { contentItemId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/creator/content/${contentItemId}/audit`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
    >
      {loading ? "Requesting…" : "Run Knowledge Audit"}
    </button>
  );
}
