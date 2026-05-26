const RAILS_HEALTH_PATH = '/edge/v0/health';
const RAILS_FETCH_TIMEOUT_MS = 2000;

type RailsHealthOk = {
  kind: 'ok';
  requestUrl: string;
  status: number;
  body: unknown;
};

type RailsHealthHttpError = {
  kind: 'http-error';
  requestUrl: string;
  status: number;
  body: unknown;
};

type RailsHealthInvalidJson = {
  kind: 'invalid-json';
  requestUrl: string;
  status: number;
  rawBody: string;
  parseError: string;
};

type RailsHealthUnreachable = {
  kind: 'unreachable';
  requestUrl: string;
  errorMessage: string;
};

type RailsHealthNotConfigured = {
  kind: 'not-configured';
};

export type RailsHealthResult =
  | RailsHealthOk
  | RailsHealthHttpError
  | RailsHealthInvalidJson
  | RailsHealthUnreachable
  | RailsHealthNotConfigured;

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function buildRailsHealthUrl(baseUrl: string) {
  return new URL(RAILS_HEALTH_PATH, `${baseUrl}/`).toString();
}

function stringifyBody(body: unknown) {
  if (typeof body === 'string') {
    return body;
  }

  return JSON.stringify(body, null, 2);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function readRailsResponseBody(response: Response) {
  const rawBody = await response.text();

  if (rawBody.trim().length === 0) {
    return {
      body: null,
      parseError: 'Response body was empty.',
      rawBody,
    };
  }

  try {
    return {
      body: JSON.parse(rawBody) as unknown,
      parseError: null,
      rawBody,
    };
  } catch (error) {
    return {
      body: null,
      parseError: getErrorMessage(error),
      rawBody,
    };
  }
}

export async function loadRailsHealthResult(
  baseUrl: string | null | undefined,
): Promise<RailsHealthResult> {
  const normalizedBaseUrl = typeof baseUrl === 'string' ? normalizeBaseUrl(baseUrl) : null;

  if (!normalizedBaseUrl) {
    return { kind: 'not-configured' };
  }

  const requestUrl = buildRailsHealthUrl(normalizedBaseUrl);

  try {
    const response = await fetch(requestUrl, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(RAILS_FETCH_TIMEOUT_MS),
    });

    const { body, parseError, rawBody } = await readRailsResponseBody(response);

    if (!response.ok) {
      return {
        kind: 'http-error',
        requestUrl,
        status: response.status,
        body: body ?? rawBody,
      };
    }

    if (parseError) {
      return {
        kind: 'invalid-json',
        requestUrl,
        status: response.status,
        rawBody,
        parseError,
      };
    }

    return {
      kind: 'ok',
      requestUrl,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      kind: 'unreachable',
      requestUrl,
      errorMessage: getErrorMessage(error),
    };
  }
}

function renderStateHeading(result: RailsHealthResult) {
  switch (result.kind) {
    case 'ok':
      return 'Rails health is reachable';
    case 'http-error':
      return 'Rails responded with an error';
    case 'invalid-json':
      return 'Rails returned invalid JSON';
    case 'unreachable':
      return 'Rails is unreachable';
    case 'not-configured':
      return 'Rails API URL is not configured';
  }
}

function renderStateDetails(result: RailsHealthResult) {
  switch (result.kind) {
    case 'ok':
      return (
        <>
          <p className="health-note">Status: {result.status}</p>
          <pre className="health-code">{stringifyBody(result.body)}</pre>
        </>
      );
    case 'http-error':
      return (
        <>
          <p className="health-note">Status: HTTP {result.status}</p>
          <pre className="health-code">{stringifyBody(result.body)}</pre>
        </>
      );
    case 'invalid-json':
      return (
        <>
          <p className="health-note">Status: HTTP {result.status}</p>
          <p className="health-error">Parse error: {result.parseError}</p>
          <pre className="health-code health-code--error">{result.rawBody}</pre>
        </>
      );
    case 'unreachable':
      return (
        <>
          <p className="health-note">Request failed before a response arrived.</p>
          <p className="health-error">{result.errorMessage}</p>
        </>
      );
    case 'not-configured':
      return (
        <p className="health-error">
          Set <code>RAILS_API_URL</code> to point at the Rails container or host port.
        </p>
      );
  }
}

export function RailsHealthView({
  result,
  workspaceUrl,
}: {
  result: RailsHealthResult;
  workspaceUrl: string | null;
}) {
  return (
    <main className="page-main health-page">
      <section className="health-hero">
        <p className="health-eyebrow">Diagnostics</p>
        <h1>Rails /edge/v0/health</h1>
        <p className="health-description">
          This page fetches the Rails health endpoint and shows the JSON payload or the failure mode
          that prevented it from loading.
        </p>
        {workspaceUrl ? <p className="health-workspace">Workspace URL: {workspaceUrl}</p> : null}
      </section>

      <section className="health-card">
        <div className="health-meta">
          <span className="health-pill">{renderStateHeading(result)}</span>
          {'requestUrl' in result ? <span className="health-url">{result.requestUrl}</span> : null}
        </div>
        {renderStateDetails(result)}
      </section>
    </main>
  );
}

export { buildRailsHealthUrl, normalizeBaseUrl, stringifyBody };
