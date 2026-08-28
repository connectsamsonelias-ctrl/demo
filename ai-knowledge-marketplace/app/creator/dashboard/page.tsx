import { redirect } from "next/navigation";

/** Consolidated into /dashboard (one entry point, role-branched) — this URL is kept working for anyone with it bookmarked. */
export default function CreatorDashboardRedirect() {
  redirect("/dashboard");
}
