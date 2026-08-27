import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

/**
 * Public pages (/, /marketplace, listing detail pages) are crawlable.
 * Everything else is either an API route (never meant to be indexed) or
 * requires a session to show anything useful/is outright private —
 * /creator, /buyer, /admin are disallowed wholesale rather than pruned
 * page by page, so a new private route added later is excluded by
 * default instead of accidentally crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/creator/", "/buyer/", "/admin/", "/signin", "/signup"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
