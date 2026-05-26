/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import { renderToString } from 'hono/jsx/dom/server';
import { Layout, getMeta, setMeta, withMeta, type Meta } from '../seo';

describe('seo helpers', () => {
  it('withMeta makes metadata available via getMeta', async () => {
    const app = new Hono();
    const meta: Meta = { pageTitle: 'Pricing', description: 'Plans and pricing' };

    app.use('/meta', withMeta(meta));
    app.get('/meta', (c) => c.json(getMeta(c)));

    const res = await app.request('/meta');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(meta);
  });

  it('setMeta can override metadata inside a route and Layout outputs SEO tags', async () => {
    const app = new Hono();

    app.use('/page', withMeta({ pageTitle: 'Old title' }));
    app.get('/page', (c) => {
      setMeta(c, {
        pageTitle: 'Pricing',
        description: 'Plans and pricing',
        canonical: 'https://umaxica.app/pricing',
        robots: 'index,follow',
        og: {
          title: 'Umaxica | Pricing',
          description: 'Plans and pricing',
          type: 'website',
          url: 'https://umaxica.app/pricing',
          image: 'https://umaxica.app/og/pricing.png',
        },
        twitter: {
          site: '@umaxica',
        },
      });

      const html = renderToString(
        <Layout c={c} brand={{ brandName: 'Umaxica' }}>
          <main>Pricing page</main>
        </Layout>,
      );
      return c.html(html);
    });

    const res = await app.request('/page');
    const body = await res.text();

    expect(body).toContain('<title>Umaxica | Pricing</title>');
    expect(body).toContain('<meta name="description" content="Plans and pricing"/>');
    expect(body).toContain('<link rel="canonical" href="https://umaxica.app/pricing"/>');
    expect(body).toContain('<meta name="robots" content="index,follow"/>');
    expect(body).toContain('<meta property="og:title" content="Umaxica | Pricing"/>');
    expect(body).toContain('<meta property="og:description" content="Plans and pricing"/>');
    expect(body).toContain('<meta property="og:type" content="website"/>');
    expect(body).toContain('<meta property="og:url" content="https://umaxica.app/pricing"/>');
    expect(body).toContain(
      '<meta property="og:image" content="https://umaxica.app/og/pricing.png"/>',
    );
    expect(body).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    expect(body).toContain('<meta name="twitter:site" content="@umaxica"/>');
  });

  it('Layout title is brand-only when no pageTitle/defaultPageTitle are present', async () => {
    const app = new Hono();

    app.get('/brand-only', (c) => {
      const html = renderToString(
        <Layout c={c} brand={{ brandName: 'Umaxica' }}>
          <main>Top page</main>
        </Layout>,
      );
      return c.html(html);
    });

    const res = await app.request('/brand-only');
    const body = await res.text();
    expect(body).toContain('<title>Umaxica</title>');
  });

  it('Layout uses default metadata and omits blank optional tags', async () => {
    const app = new Hono();

    app.get('/default-meta', (c) => {
      const html = renderToString(
        <Layout
          c={c}
          brand={{ brandName: 'Umaxica' }}
          defaultMeta={{
            title: '   ',
            pageTitle: 'Home',
            description: '   ',
            canonical: '   ',
            robots: '   ',
            og: {
              title: '   ',
              description: '   ',
              type: '   ',
              url: '   ',
              image: '   ',
            },
            twitter: {
              card: '   ',
              site: '   ',
            },
          }}
        >
          <main>Default metadata page</main>
        </Layout>,
      );
      return c.html(html);
    });

    const res = await app.request('/default-meta');
    const body = await res.text();

    expect(body).toContain('<title>Umaxica | Home</title>');
    expect(body).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    expect(body).not.toContain('name="description"');
    expect(body).not.toContain('rel="canonical"');
    expect(body).not.toContain('name="robots"');
    expect(body).not.toContain('property="og:');
    expect(body).not.toContain('name="twitter:site"');
  });
});
