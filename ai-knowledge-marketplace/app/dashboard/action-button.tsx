"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Generic POST-and-refresh button shared by content moderation and user actions on the admin dashboard. */
export function ActionButton({
  url,
  label,
  loadingLabel,
  body,
}: {
  url: string;
  label: string;
  loadingLabel: string;
  body?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setLoading(false);
    if (!res.ok) {
      const responseBody = await res.json().catch(() => null);
      setError(responseBody?.error?.message ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-block">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        {loading ? loadingLabel : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
