import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

const SITE_NAME = "AI Knowledge Licensing Platform";
const SITE_DESCRIPTION =
  "A rights-cleared marketplace connecting creators with AI, research and enterprise buyers.";

/**
 * Milestone 20 (SEO/launch): a real title template (child pages set only
 * their own segment via `title: "..."` and this renders "Segment | Site
 * Name") plus Open Graph/Twitter defaults every page inherits unless it
 * overrides them. `metadataBase` is required for Next to resolve the
 * relative OG image URL below into an absolute one — reads from
 * NEXT_PUBLIC_SITE_URL, falling back to localhost in dev.
 */
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200 px-6 py-4">
          <span className="font-semibold">AI Knowledge Licensing Platform</span>
        </header>
        <main className="px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
