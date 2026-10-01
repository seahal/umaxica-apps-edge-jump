import { expect, test, type APIResponse } from '@playwright/test';

test.describe('jump gateway smoke', () => {
  test('/ returns a 200 response after the about redirect', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL('/about');
    await expect(page.locator('body')).toContainText('UMAXICA');
  });

  test('invalid rt parameter does not redirect to an external URL', async ({ page }) => {
    const response = await page.goto('/?rt=https%3A%2F%2Fevil.example');

    expect(response?.status()).toBe(400);
    await expect(page).toHaveURL('/?rt=https%3A%2F%2Fevil.example');
  });

  test('/about serves the about page', async ({ page }) => {
    const response = await page.goto('/about');

    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('UMAXICA');
    await expect(page.locator('body')).toHaveClass('product');
    const background = await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgb(246, 244, 239)');
  });

  test('/about keeps the product layout on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    const mainBox = await page.locator('main').boundingBox();
    expect(mainBox?.width).toBeGreaterThan(200);
    expect(mainBox?.width).toBeLessThanOrEqual(375);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('/health serves the health HTML page by default', async ({ page }) => {
    const response = await page.goto('/health');

    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('service');
    await expect(page.locator('body')).toContainText('jump');
    await expect(page.locator('body')).not.toHaveClass('product');
    const background = await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background === 'rgba(0, 0, 0, 0)' || background === 'rgb(255, 255, 255)').toBe(true);
  });

  test('/health returns JSON when requested', async ({ request }) => {
    const response = await request.get('/health', {
      headers: {
        Accept: 'application/json',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual(
      expect.objectContaining({
        status: 'OK',
        service: 'jump',
        edge: 'local',
      }),
    );
  });

  test('/health.json returns health JSON', async ({ request }) => {
    const response = await request.get('/health.json');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual(
      expect.objectContaining({
        status: 'OK',
        service: 'jump',
        edge: 'local',
      }),
    );
  });

  test('/health.html serves the health HTML page', async ({ page }) => {
    const response = await page.goto('/health.html');

    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('service');
    await expect(page.locator('body')).toContainText('jump');
  });

  test('unknown routes redirect to about', async ({ request }) => {
    const response = await request.get('/not-found');

    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe('/about');
  });

  test('invalid rt shows a splash card with reload', async ({ page }) => {
    const response = await page.goto('/?rt=not-a-jwt');

    expect(response?.status()).toBe(400);
    await expect(page.locator('body')).toHaveClass('splash');
    await expect(page.locator('.reload')).toBeVisible();
    await expect(page.locator('a.primary[href="/about"]')).toBeVisible();
    const background = await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgb(28, 25, 23)');
    await page.locator('a.primary[href="/about"]').click();
    await expect(page).toHaveURL('/about');
  });

  test('security headers are present', async ({ request }) => {
    const response = await request.get('/about');

    expectSecurityHeaders(response);
  });
});

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers();

  expect(headers['content-security-policy']).toContain("default-src 'none'");
  expect(headers['content-security-policy']).toContain("style-src 'sha256-");
  expect(headers['content-security-policy']).not.toContain("'unsafe-inline'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-xss-protection']).toBe('0');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-resource-policy']).toBe('same-origin');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toBeTruthy();
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
  expect(headers['set-cookie']).toBeUndefined();
}
