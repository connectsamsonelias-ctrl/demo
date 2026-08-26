export default function HomePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">AI Knowledge Licensing Platform</h1>
      <p className="mt-2 text-slate-600">
        This is still a placeholder shell, not the real landing page (P01) —
        that&apos;s a later milestone. These links exist so the creator flow built
        so far (signup → profile → content submission → dashboard) is
        actually reachable for a demo.
      </p>
      <div className="mt-4 flex gap-4 text-sm">
        <a href="/signup" className="underline">
          Sign up
        </a>
        <a href="/signin" className="underline">
          Sign in
        </a>
        <a href="/creator/dashboard" className="underline">
          Creator dashboard
        </a>
      </div>
    </div>
  );
}
