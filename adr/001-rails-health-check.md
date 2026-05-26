# Plan 001: Rails Backend Health Check Integration

## Status: Pending

## GitHub Issue

https://github.com/seahal/umaxica-apps-jump/issues/247

## Problem

The apex domains (`app/apex`, `com/apex`, `org/apex`) each expose a `/health` endpoint that currently only reports the Worker's own status (timestamp, brand name). There is no visibility into the Rails backend's health from these endpoints.

The Rails backend exposes `/edge/v0/health` which returns a JSON payload. Apex health pages should fetch this, display the JSON content on success, and clearly surface error states (timeout, connection failure, non-2xx response).

## Scope

- `app/apex`, `com/apex`, `org/apex` only
- `dev/apex` is **excluded** — its `/health` returns Worker-only status by design
- Local dev: `wrangler dev` runs on the host (outside Docker), so `RAILS_API_URL=http://localhost:3000`
- Production: real URL (e.g. `https://api.umaxica.com`)

## Architecture

```
Browser → app.umaxica.com/health
  → Cloudflare Worker (app/apex)
      ├── Worker status: always OK
      └── fetch(RAILS_API_URL + /edge/v0/health)  ← new
           → JSON response OR error
  → HTML page with both sections
```

**Key invariant:** Worker returns HTTP 200 even when Rails is unreachable. Rails status is informational only.

## Implementation

### 1. `HealthBindings` — add `RAILS_API_URL`

```ts
export interface HealthBindings {
  Bindings: {
    BRAND_NAME?: string;
    RAILS_API_URL?: string;
  };
}
```

### 2. Rails sub-fetch in `routes/health.ts`

Use `AbortSignal.timeout(1500)` (shorter than the route-level `hono/timeout` of 2000ms).

```ts
type RailsHealthResult =
  | { ok: true; status: number; body: string }
  | { ok: false; error: string };

async function fetchRailsHealth(apiUrl: string): Promise<RailsHealthResult> {
  try {
    const res = await fetch(`${apiUrl}/edge/v0/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

### 3. Route handler

```ts
route.get('/health', timeout(2000), async (c: HealthContext) => {
  const brandName = getBrandName(c.env);
  const railsApiUrl = c.env.RAILS_API_URL;
  const railsResult = railsApiUrl ? await fetchRailsHealth(railsApiUrl) : null;
  return renderHealthResponse(brandName, railsResult);
});
```

### 4. HTML — `shared/apex/html/health-page.ts`

Add a "Rails Backend" section below the existing Worker status section:

```html
<section>
  <h2>Rails Backend</h2>
  <!-- if RAILS_API_URL not set: -->
  <p>RAILS_API_URL not configured</p>

  <!-- if fetch succeeded (2xx): -->
  <p><strong>Status:</strong> OK (HTTP 200)</p>
  <pre>{ ...json pretty-printed... }</pre>

  <!-- if non-2xx: -->
  <p><strong>Status:</strong> Error (HTTP 503)</p>
  <pre>{ ...body... }</pre>

  <!-- if fetch threw: -->
  <p><strong>Status:</strong> Unreachable</p>
  <p>Error: <code>fetch failed: ...</code></p>
</section>
```

JSON is displayed with `JSON.stringify(JSON.parse(body), null, 2)` inside `<pre>`. If parse fails, raw text is shown.

## Files to Change

| File                              | Change                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `shared/apex/routes/health.ts`    | Add `RAILS_API_URL` to bindings, add `fetchRailsHealth()`, pass result to HTML builder |
| `shared/apex/html/health-page.ts` | Add optional `railsResult` param to `buildHealthPageHtml`, render Rails section        |
| `app/apex/wrangler.jsonc`         | Add `RAILS_API_URL` (dev: `http://localhost:3000`, prod: TBD)                          |
| `com/apex/wrangler.jsonc`         | Same                                                                                   |
| `org/apex/wrangler.jsonc`         | Same                                                                                   |
| Tests                             | Mock `fetch` for: success (2xx JSON), non-2xx, network error, URL not set              |

## Docker Compose Note

`wrangler dev` runs **on the host machine**, not inside a container. To reach Rails in Docker Compose, use the host-mapped port:

```
# wrangler.jsonc development env
RAILS_API_URL = "http://localhost:3000"
```

`rails:3000` (Docker DNS) and `host.docker.internal` (container→host) are **not** appropriate here.

## Tests

| Case                     | Expected                                   |
| ------------------------ | ------------------------------------------ |
| `RAILS_API_URL` not set  | No fetch; HTML shows "not configured"      |
| Rails returns 200 + JSON | HTML shows "OK" + pretty JSON              |
| Rails returns 503        | HTML shows "Error (HTTP 503)" + body       |
| fetch throws (network)   | HTML shows "Unreachable" + error message   |
| fetch times out          | HTML shows "Unreachable" + timeout message |

Worker always returns HTTP 200 in all cases.

## Approach

### Environment Variable

Add `RAILS_API_URL` to each affected workspace's `wrangler.jsonc` under both `development` and `production` env blocks.

```
# Docker Compose cross-container (dev):  http://rails:3000
# or host access (dev):                  http://host.docker.internal:3000
# Production:                            https://api.umaxica.com  (TBD)
```

### Shared Logic (`shared/apex/routes/health.ts`)

Extend the health route handler to:

1. Read `RAILS_API_URL` from `c.env` bindings
2. If set, `fetch(`${RAILS_API_URL}/edge/v0/health`)` with a 2000 ms `AbortSignal` timeout
3. Parse the JSON response body
4. Pass the result (or error details) to the HTML builder

Error cases to handle:

- `RAILS_API_URL` not set → display "Rails API URL not configured"
- Fetch throws (network error, DNS failure) → display error message
- Response status is not 2xx → display HTTP status + body if parseable
- JSON parse failure → display raw text

### HTML Builder (`shared/apex/html/health-page.ts`)

Add a second section to the health page:

```
Status:    OK
Timestamp: <iso>

Rails Backend
─────────────
Status:  <ok | error>
Detail:  <json pretty-printed | error message>
```

### Bindings Type

Add `RAILS_API_URL?: string` to `HealthBindings.Bindings`.

## Files to Change

| File                                            | Change                                                 |
| ----------------------------------------------- | ------------------------------------------------------ |
| `shared/apex/routes/health.ts`                  | Add Rails fetch logic + updated bindings type          |
| `shared/apex/html/health-page.ts`               | Add Rails health section to HTML output                |
| `app/apex/wrangler.jsonc`                       | Add `RAILS_API_URL` var                                |
| `com/apex/wrangler.jsonc`                       | Add `RAILS_API_URL` var                                |
| `org/apex/wrangler.jsonc`                       | Add `RAILS_API_URL` var                                |
| `shared/apex/routes/index.test.ts` (or related) | Update/add tests for Rails fetch success + error paths |

## Tests

- Rails fetch succeeds → JSON displayed
- Rails fetch fails (network error) → error message shown, Worker still returns 200
- Rails returns non-2xx → error message with status code shown
- `RAILS_API_URL` not set → "not configured" shown, no fetch attempted

## Notes

- The Worker must remain healthy (200) even when the Rails backend is unreachable; the Rails status is informational only.
- Timeout is 2000 ms, consistent with the existing `hono/timeout` on the route.
- Do not use `hono/timeout` for the Rails sub-fetch; use `AbortSignal.timeout(2000)` to avoid conflating timeouts.

## Outcome

**Implemented.**

- Migrated `app/apex`, `com/apex`, `org/apex`, and `net/apex` to use a unified `createHealthRoute` from `shared/apex/routes/health.ts`.
- Integrated `RAILS_API_URL` fetching for Rails backend status visibility in the unified HTML status page.
- Added `RAILS_API_URL` environment variables to the respective `wrangler.jsonc` configurations.
- Handled non-2xx responses and unhandled fetch exceptions properly as per the plan's UI requirements.
- Updated `vp check` and `vp test` to ensure robust type checking and correct DOM assertions across the updated workspaces.
