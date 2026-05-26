import { buildSitemapXml } from './sitemap';
import type { SitemapEntry } from './sitemap';

describe('buildSitemapXml', () => {
  it('generates valid XML with a single entry', () => {
    const entries: SitemapEntry[] = [{ loc: 'https://umaxica.com/' }];
    const xml = buildSitemapXml(entries);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://umaxica.com/</loc>');
    expect(xml).toContain('</urlset>');
  });

  it('includes optional fields when provided', () => {
    const entries: SitemapEntry[] = [
      {
        loc: 'https://umaxica.com/',
        lastmod: '2026-01-01',
        changefreq: 'monthly',
        priority: 1.0,
      },
    ];
    const xml = buildSitemapXml(entries);

    expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
    expect(xml).toContain('<changefreq>monthly</changefreq>');
    expect(xml).toContain('<priority>1.0</priority>');
  });

  it('omits optional fields when not provided', () => {
    const entries: SitemapEntry[] = [{ loc: 'https://umaxica.app/' }];
    const xml = buildSitemapXml(entries);

    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<changefreq>');
    expect(xml).not.toContain('<priority>');
  });

  it('handles multiple entries', () => {
    const entries: SitemapEntry[] = [
      { loc: 'https://umaxica.com/' },
      { loc: 'https://umaxica.com/about' },
    ];
    const xml = buildSitemapXml(entries);

    const urlCount = (xml.match(/<url>/g) ?? []).length;
    expect(urlCount).toBe(2);
    expect(xml).toContain('<loc>https://umaxica.com/</loc>');
    expect(xml).toContain('<loc>https://umaxica.com/about</loc>');
  });

  it('escapes special XML characters in loc', () => {
    const entries: SitemapEntry[] = [{ loc: 'https://example.com/?a=1&b=2' }];
    const xml = buildSitemapXml(entries);

    expect(xml).toContain('<loc>https://example.com/?a=1&amp;b=2</loc>');
    expect(xml).not.toContain('&b=2</loc>');
  });

  it('handles empty entries array', () => {
    const xml = buildSitemapXml([]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
    expect(xml).not.toContain('<url>');
  });

  it('formats priority with one decimal place', () => {
    const entries: SitemapEntry[] = [{ loc: 'https://example.com/', priority: 0.5 }];
    const xml = buildSitemapXml(entries);

    expect(xml).toContain('<priority>0.5</priority>');
  });
});
