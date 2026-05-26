import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  RailsHealthView,
  loadRailsHealthResult,
} from '../src/app/(page)/rails-health/rails-health';

const okResult = {
  kind: 'ok',
  requestUrl: 'http://host.docker.internal:3000/edge/v0/health',
  status: 200,
  body: { status: 'ok', uptime: 123 },
} as const;

const unreachableResult = {
  kind: 'unreachable',
  requestUrl: 'http://host.docker.internal:3000/edge/v0/health',
  errorMessage: 'connect ECONNREFUSED',
} as const;

describe('app/core rails health', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns not-configured without fetching', async () => {
    const result = await loadRailsHealthResult(undefined);

    expect(result).toEqual({ kind: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', uptime: 123 }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    const result = await loadRailsHealthResult('http://host.docker.internal:3000');

    expect(result).toEqual({
      kind: 'ok',
      requestUrl: 'http://host.docker.internal:3000/edge/v0/health',
      status: 200,
      body: { status: 'ok', uptime: 123 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://host.docker.internal:3000/edge/v0/health',
      expect.objectContaining({
        cache: 'no-store',
        headers: {
          accept: 'application/json',
        },
      }),
    );
  });

  it('returns http error bodies when Rails responds non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'error', message: 'down' }), {
        status: 503,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    const result = await loadRailsHealthResult('http://host.docker.internal:3000/');

    expect(result).toEqual({
      kind: 'http-error',
      requestUrl: 'http://host.docker.internal:3000/edge/v0/health',
      status: 503,
      body: { status: 'error', message: 'down' },
    });
  });

  it('returns invalid-json when the response cannot be parsed', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>bad gateway</html>', {
        status: 200,
        headers: {
          'content-type': 'text/html',
        },
      }),
    );

    const result = await loadRailsHealthResult('http://host.docker.internal:3000');

    expect(result).toMatchObject({
      kind: 'invalid-json',
      requestUrl: 'http://host.docker.internal:3000/edge/v0/health',
      status: 200,
      rawBody: '<html>bad gateway</html>',
    });
  });

  it('returns unreachable on fetch failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const result = await loadRailsHealthResult('http://host.docker.internal:3000');

    expect(result).toEqual({
      kind: 'unreachable',
      requestUrl: 'http://host.docker.internal:3000/edge/v0/health',
      errorMessage: 'connect ECONNREFUSED',
    });
  });

  it('renders the success view', () => {
    const html = renderToStaticMarkup(
      <RailsHealthView result={okResult} workspaceUrl="http://localhost:5171" />,
    );

    expect(html).toContain('Rails health is reachable');
    expect(html).toContain('&quot;status&quot;: &quot;ok&quot;');
    expect(html).toContain('&quot;uptime&quot;: 123');
    expect(html).toContain('Workspace URL: http://localhost:5171');
  });

  it('renders the error view', () => {
    const html = renderToStaticMarkup(
      <RailsHealthView result={unreachableResult} workspaceUrl={null} />,
    );

    expect(html).toContain('Rails is unreachable');
    expect(html).toContain('connect ECONNREFUSED');
  });
});
