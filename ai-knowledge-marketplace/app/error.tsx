"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-red-700">Something went wrong</h1>
      <p className="mt-2 text-slate-600">
        {process.env.NODE_ENV === "production" ? "Please try again." : error.message}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded border border-slate-300 px-3 py-1.5 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
