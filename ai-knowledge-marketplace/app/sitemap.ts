import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";
import { listMarketplaceItems } from "@/lib/marketplace";

// Regenerate hourly rather than only at build time — new listings must
// eventually appear here without a full redeploy.
export const revalidate = 3600;

/**
 * Only public, unauthenticated pages belong here: the marketing/landing
 * page, the marketplace index, and every currently-LISTED item's detail
 * page. Signin/signup and every /creator, /buyer, /admin page are
 * deliberately excluded — they either need a session to be useful or
 * are outright private, and robots.txt (app/robots.ts) disallows
 * crawling them anyway.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const items = await listMarketplaceItems();

  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/marketplace`, changeFrequency: "daily", priority: 0.9 },
    ...items.map((item) => ({
      url: `${siteUrl}/marketplace/${item.id}`,
      lastModified: item.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
