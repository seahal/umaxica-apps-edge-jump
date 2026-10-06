// Browser-level navigation matrix for `/?rt=` (hardening plan 10.1). Jump runs
// in the test process behind a real loopback HTTP listener — a potentially
// trustworthy origin, so Chromium sends its genuine Fetch Metadata — and the
// issuer page is served from `localhost`, a different site. The listener maps
// each request onto the configured https service origin before the app sees
// it; nothing else about the request is changed.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src';
import { JoseOutboundSigner } from '../src/core/sign_outbound';

const JUMP = 'https://jump.example.net';
const ISSUER = 'https://issuer.example.com';
const DESTINATION = 'https://dest.example.com';

type Seen = { status: number; mode?: string; dest?: string; site?: string; purpose?: string };

let jumpServer: Server;
let pageServer: Server;
let jumpBase = '';
let pageBase = '';
const pages = new Map<string, { status: number; headers: Record<string, string>; body: string }>();
let seen: Seen[] = [];
let issuerKeys: Awaited<ReturnType<typeof generateKeyPair>>;

function listen(server: Server, host: string) {
  return new Promise<string>((resolve) =>
    server.listen(0, host, () =>
      resolve(`http://${host}:${(server.address() as AddressInfo).port}`),
    ),
  );
}

test.beforeAll(async () => {
  issuerKeys = await generateKeyPair('ES384');
  const jumpKeys = await generateKeyPair('ES384');
  const app = createApp({
    registry: {
      [ISSUER]: {
        iss: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        allowed_dst_internal: [DESTINATION],
      },
    },
    fetchJwks: async () => ({
      keys: [{ ...(await exportJWK(issuerKeys.publicKey)), kid: 'k', alg: 'ES384', use: 'sig' }],
    }),
    config: { serviceOrigin: JUMP, environment: 'staging' },
    signer: new JoseOutboundSigner(jumpKeys.privateKey, 'jump'),
  });
  jumpServer = createServer(async (req, res) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      if (typeof value === 'string') headers.set(name, value);
    const response = await app.fetch(
      new Request(new URL(String(req.url), JUMP), { method: req.method ?? 'GET', headers }),
    );
    const entry: Seen = { status: response.status };
    for (const [key, name] of [
      ['mode', 'sec-fetch-mode'],
      ['dest', 'sec-fetch-dest'],
      ['site', 'sec-fetch-site'],
      ['purpose', 'sec-purpose'],
    ] as const) {
      const value = req.headers[name];
      if (typeof value === 'string') entry[key] = value;
    }
    seen.push(entry);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  pageServer = createServer((req, res) => {
    const page = pages.get(String(req.url)) ?? { status: 404, headers: {}, body: '' };
    res.writeHead(page.status, { 'Content-Type': 'text/html', ...page.headers });
    res.end(page.body);
  });
  jumpBase = await listen(jumpServer, '127.0.0.1');
  pageBase = await listen(pageServer, 'localhost');
});

test.afterAll(async () => {
  jumpServer?.close();
  pageServer?.close();
});

async function setup(page: Page) {
  seen = [];
  pages.clear();
  // The destination is never contacted: the redirect to it is aborted.
  await page.route(`${DESTINATION}/**`, (route) => route.abort());
  const token = async () => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: ISSUER,
      aud: JUMP,
      sub: 'jump-redirect',
      iat: now,
      nbf: now,
      exp: now + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: `${DESTINATION}/arrived`,
    })
      .setProtectedHeader({ typ: 'jump-request+jwt', alg: 'ES384', kid: 'k' })
      .sign(issuerKeys.privateKey);
  };
  const jumpUrl = async () => `${jumpBase}/?rt=${await token()}`;
  const issuerPage = (body: string, path = '/start', status = 200, headers = {}) =>
    pages.set(path, { status, headers, body });
  return { token, jumpUrl, issuerPage };
}

const NAVIGATE = { status: 302, mode: 'navigate', dest: 'document' };

/** Resolves with Jump's response to the navigation `action` starts. */
async function jumpResponse(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse((r) => r.url().startsWith(`${jumpBase}/?rt=`));
  await action().catch(() => undefined);
  return response;
}

async function expectRedirect(page: Page, action: () => Promise<unknown>) {
  const response = await jumpResponse(page, action);
  expect(response.status()).toBe(302);
  expect(new URL(String(response.headers()['location'])).origin).toBe(DESTINATION);
}

test.describe('browser navigation matrix on /?rt=', () => {
  test('top-level link navigation is redirected', async ({ page }) => {
    const { jumpUrl, issuerPage } = await setup(page);
    issuerPage(`<a id="go" href="${await jumpUrl()}">go</a>`);
    await page.goto(`${pageBase}/start`);
    await expectRedirect(page, () => page.click('#go'));
    expect(seen).toEqual([{ ...NAVIGATE, site: 'cross-site' }]);
  });

  test('top-level GET form submission is redirected', async ({ page }) => {
    const { token, issuerPage } = await setup(page);
    issuerPage(
      `<form action="${jumpBase}/" method="get"><input name="rt" value="${await token()}"><button id="go">go</button></form>`,
    );
    await page.goto(`${pageBase}/start`);
    await expectRedirect(page, () => page.click('#go'));
    expect(seen).toEqual([expect.objectContaining(NAVIGATE)]);
  });

  test('a 302 chain ending at Jump is redirected', async ({ page }) => {
    const { jumpUrl, issuerPage } = await setup(page);
    issuerPage(`<a id="go" href="${pageBase}/bounce">go</a>`);
    issuerPage('', '/bounce', 303, { Location: `${pageBase}/bounce2` });
    issuerPage('', '/bounce2', 302, { Location: await jumpUrl() });
    await page.goto(`${pageBase}/start`);
    await expectRedirect(page, () => page.click('#go'));
    expect(seen).toEqual([expect.objectContaining(NAVIGATE)]);
  });

  test('a typed (direct) navigation is redirected', async ({ page }) => {
    const { jumpUrl } = await setup(page);
    const url = await jumpUrl();
    await expectRedirect(page, () => page.goto(url));
    expect(seen).toEqual([{ ...NAVIGATE, site: 'none' }]);
  });

  test('fetch() from a page is refused', async ({ page }) => {
    const { jumpUrl, issuerPage } = await setup(page);
    issuerPage('<p>issuer</p>');
    await page.goto(`${pageBase}/start`);
    const url = await jumpUrl();
    await page.evaluate(async (target) => {
      await fetch(target, { mode: 'no-cors' }).catch(() => undefined);
      await fetch(target).catch(() => undefined);
      await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onloadend = resolve;
        xhr.open('GET', target);
        xhr.send();
      });
    }, url);
    await expect.poll(() => seen.length).toBe(3);
    expect(seen).toEqual([
      expect.objectContaining({ status: 400, mode: 'no-cors', dest: 'empty' }),
      expect.objectContaining({ status: 400, mode: 'cors', dest: 'empty' }),
      expect.objectContaining({ status: 400, mode: 'cors', dest: 'empty' }),
    ]);
  });

  test('an iframe is refused', async ({ page }) => {
    const { jumpUrl, issuerPage } = await setup(page);
    issuerPage(`<iframe src="${await jumpUrl()}"></iframe>`);
    await page.goto(`${pageBase}/start`);
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ status: 400, mode: 'navigate', dest: 'iframe' });
  });

  test('a <link rel=prefetch> is refused when the browser issues it', async ({ page }) => {
    const { jumpUrl, issuerPage } = await setup(page);
    issuerPage(`<link rel="prefetch" href="${await jumpUrl()}"><p>issuer</p>`);
    await page.goto(`${pageBase}/start`);
    await page.waitForTimeout(1000);
    // Chromium may skip a prefetch entirely; if it is sent, it must be refused.
    for (const entry of seen) expect(entry).toMatchObject({ status: 400 });
    test.info().annotations.push({ type: 'prefetch requests', description: JSON.stringify(seen) });
  });

  test('a speculation-rules prerender is refused when the browser issues it', async ({ page }) => {
    const { jumpUrl, issuerPage } = await setup(page);
    const url = await jumpUrl();
    issuerPage(
      `<script type="speculationrules">${JSON.stringify({ prerender: [{ source: 'list', urls: [url] }] })}</script><p>issuer</p>`,
    );
    await page.goto(`${pageBase}/start`);
    await page.waitForTimeout(1000);
    for (const entry of seen) expect(entry).toMatchObject({ status: 400 });
    test.info().annotations.push({ type: 'prerender requests', description: JSON.stringify(seen) });
  });
});
