# Plan 003: Migrate `com/apex`, `org/apex`, `net/apex` to Direct Route Composition

## Status: Completed

## GitHub Issue

https://github.com/seahal/umaxica-apps-jump/issues/249

## Problem

`com/apex`, `org/apex`, and `net/apex` all instantiate their Hono apps through the `createApexApp()` factory defined in `shared/apex/create-apex-app.tsx`. This factory obscures the middleware and route composition behind a configuration object, making the apps harder to reason about and diverging from how idiomatic Hono apps are structured.

`app/apex` was already migrated to direct composition (explicit `app.use(...)` / `app.route(...)` calls). The remaining three workspaces should follow the same pattern.

## Approach

Each workspace replaces its `createApexApp(config)` call with a manually composed Hono app, identical in structure to `app/apex/src/app.tsx`. The individual route factories and middleware from `shared/apex` are still used — only the outer `createApexApp` wrapper is removed.

### Template (based on `app/apex/src/app.tsx`)

```ts
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  etagMiddleware, rateLimitMiddleware, apexCsrfMiddleware,
  securityHeadersMiddleware, i18nMiddleware,
} from '../../../shared/apex/middleware'
import {
  createHealthRoute, createAboutRoute, createRootRoute, handleHealthError,
} from '../../../shared/apex/routes'
import { createNotFoundFallback } from '../../../shared/apex/html/fallback-pages'
import { createRootRedirect } from '../../../shared/apex/root-redirect'
import type { ApexBindings } from '../../../shared/apex/create-apex-app'

const { resolveRedirectUrl, getDefaultRedirectUrl, buildRegionErrorPayload } =
  createRootRedirect('umaxica.com') // adjust per domain

const app = new Hono<ApexBindings>()

app.use(etagMiddleware())
app.use(rateLimitMiddleware())
app.use('*', apexCsrfMiddleware())
app.use('*', securityHeadersMiddleware())
app.use(i18nMiddleware())

app.route('/', createHealthRoute())
app.route('/', createRootRoute('redirect', renderer, { resolveRedirectUrl, getDefaultRedirectUrl, buildRegionErrorPayload }))
app.route('/', createAboutRoute(renderer, { getAboutMeta, renderAboutContent }))

app.onError(async (err, c) => { ... })
app.notFound((c) => createNotFoundFallback(c))

export default app
```

### Per-Workspace Notes

| Workspace  | Root Handler | Domain        |
| ---------- | ------------ | ------------- |
| `com/apex` | `redirect`   | `umaxica.com` |
| `org/apex` | `redirect`   | `umaxica.org` |
| `net/apex` | `page`       | `umaxica.net` |

`net/apex` uses `rootHandler: 'page'` so it uses `createRootRoute('page', ...)` with `getRootMeta` and `renderRootContent` instead of the redirect config.

### `createApexApp` Deprecation

After migration, `createApexApp` will have no callers. Add a `@deprecated` JSDoc comment to the function and a note that it will be removed in a future cleanup. Do not delete it yet — that is a separate task.

## Files to Change

| File                              | Change                                                  |
| --------------------------------- | ------------------------------------------------------- |
| `com/apex/src/index.tsx`          | Replace `createApexApp(config)` with direct composition |
| `org/apex/src/index.tsx`          | Replace `createApexApp(config)` with direct composition |
| `net/apex/src/app.tsx`            | Replace `createApexApp(config)` with direct composition |
| `shared/apex/create-apex-app.tsx` | Add `@deprecated` JSDoc to `createApexApp`              |

## Tests

Existing apex tests (in `shared/apex/__tests__/create-apex-app.test.ts`) test the factory itself — those remain valid. No additional tests are required for this migration since the behaviour is identical; the goal is structural, not behavioural.

If per-workspace smoke tests exist, verify they still pass after migration.

## Notes

- `net/apex` does not use `createRootRedirect`; it uses `getRootMeta` / `renderRootContent` directly — follow the `rootHandler: 'page'` branch from the existing factory.
- Do not remove OpenTelemetry instrumentation from `app/apex` — it already wraps with `instrument()` in `index.tsx`, not in `app.tsx`. The other workspaces use Sentry wrapping; keep that in place.
- Sentry in `com/apex` is currently commented out with a note to re-enable. Keep the comment.

---

## Outcome

**Implemented and merged.** All three apex workspaces migrated successfully.

### Changes Made

- `com/apex/src/index.tsx` — Replaced `createApexApp(config)` with direct Hono app composition (`createRootRedirect('umaxica.com')` + explicit middleware + route mounts)
- `org/apex/src/index.tsx` — Same pattern for `umaxica.org`
- `net/apex/src/app.tsx` — Same pattern using `createRootRoute('page', ...)` for the page handler variant
- `shared/apex/create-apex-app.tsx` — Added `@deprecated` JSDoc to `createApexApp`

### Verification

- `vp check`: ✅ 459 files formatted, 204 files lint/type clean
- `vp test`: ✅ 363 tests passed (57 test files), no regressions

### Closes

https://github.com/seahal/umaxica-apps-jump/issues/249
