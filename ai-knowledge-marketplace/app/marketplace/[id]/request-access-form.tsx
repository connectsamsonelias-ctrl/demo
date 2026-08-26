"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/** Screen B04 (Request Access). Organization isn't a field here — it's derived server-side from the buyer's own profile. */
export function RequestAccessForm({ contentItemId }: { contentItemId: string }) {
  const router = useRouter();
  const [intendedUse, setIntendedUse] = useState("");
  const [requestedScope, setRequestedScope] = useState("");
  const [requestedDuration, setRequestedDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/buyer/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentItemId,
        intendedUse,
        requestedScope,
        requestedDuration: requestedDuration || undefined,
      }),
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
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        Intended use
        <textarea
          required
          value={intendedUse}
          onChange={(e) => setIntendedUse(e.target.value)}
          rows={2}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Required scope
        <input
          required
          value={requestedScope}
          onChange={(e) => setRequestedScope(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Duration (optional)
        <input
          value={requestedDuration}
          onChange={(e) => setRequestedDuration(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      {error && <p className="text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-1 self-start rounded bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
      >
        {loading ? "Requesting…" : "Request access"}
      </button>
    </form>
  );
}
