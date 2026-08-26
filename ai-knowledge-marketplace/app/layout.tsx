import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Knowledge Licensing Platform",
  description:
    "A rights-cleared marketplace connecting creators with AI, research and enterprise buyers.",
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
