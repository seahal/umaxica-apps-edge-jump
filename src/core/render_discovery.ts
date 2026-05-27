import { escapeXml } from './escape';

export function renderRobots(origin: string) {
  const sitemapUrl = new URL('/sitemap.xml', origin).toString();
  return `User-agent: *\nDisallow: /\nAllow: /about\nSitemap: ${sitemapUrl}\n`;
}

export function renderSitemap(origin: string) {
  const aboutUrl = new URL('/about', origin).toString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(aboutUrl)}</loc>
  </url>
</urlset>
`;
}
