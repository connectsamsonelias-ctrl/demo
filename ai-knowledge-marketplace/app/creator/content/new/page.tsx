"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function NewContentPage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("youtube");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("en");
  const [ownershipAttested, setOwnershipAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/creator/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl,
        sourcePlatform,
        title,
        description: description || undefined,
        category,
        language,
        ownershipAttested,
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
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">Submit content</h1>
      <p className="mt-1 text-sm text-slate-600">
        This runs the free AI Knowledge Audit against the details below — not against the
        actual video (see the dashboard for why).
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Source URL
          <input
            type="url"
            required
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Source platform
          <input
            required
            value={sourcePlatform}
            onChange={(e) => setSourcePlatform(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <input
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Language
          <input
            required
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={ownershipAttested}
            onChange={(e) => setOwnershipAttested(e.target.checked)}
            className="mt-1"
          />
          I own this content, or I have the necessary rights and authority to submit it to this
          platform for the processing and potential licensing described in these terms.
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
