import { renderHealthPage } from './health-page';

describe('renderHealthPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the fallback health response when the primary response cannot be built', async () => {
    const NativeResponse = Response;
    let responseCalls = 0;

    class ThrowOnceResponse extends NativeResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        responseCalls += 1;

        if (responseCalls === 1) {
          throw new Error('primary response failed');
        }

        super(body, init);
      }
    }

    vi.stubGlobal('Response', ThrowOnceResponse);

    const response = renderHealthPage({ BRAND_NAME: 'UMAXCA' });

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toContain('status: error');
  });
});
