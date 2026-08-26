"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function EditBuyerProfilePage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState("");
  const [industry, setIndustry] = useState("");
  const [useCase, setUseCase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/buyer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName,
        organizationType,
        industry: industry || undefined,
        useCase: useCase || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Something went wrong.");
      return;
    }
    router.push("/buyer/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Buyer profile</h1>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Organization name
          <input
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Organization type
          <input
            required
            value={organizationType}
            onChange={(e) => setOrganizationType(e.target.value)}
            placeholder="e.g. AI company, university, enterprise"
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Industry
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          AI/research use case
          <textarea
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            rows={3}
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
