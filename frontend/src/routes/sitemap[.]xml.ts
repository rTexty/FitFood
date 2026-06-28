import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://id-preview--d929749d-2f6e-45ee-aa6f-c6f4491a94aa.lovable.app";

const paths = [
  "/",
  "/goals",
  "/dashboard",
  "/scan",
  "/expiring",
  "/recipes",
  "/planner",
  "/profile",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = paths
          .map(
            (p) =>
              `  <url>\n    <loc>${BASE_URL}${p}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`,
          )
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
