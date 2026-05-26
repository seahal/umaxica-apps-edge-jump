# Plan 002: Create `dev/apex` — Hono on Vercel

## Status: Completed (partial — see Outcome)

## GitHub Issue

https://github.com/seahal/umaxica-apps-jump/issues/248

## Problem

`umaxica.dev` is deployed on Vercel. There is currently no apex-layer Hono service for the `dev` domain. A lightweight `dev/apex` service is needed to handle:

- Root redirect (`/`) → `umaxica.dev`
- Health check (`/health`) → proxy and display Rails `/edge/v0/health` JSON
- About page (`/about`) → domain description

This plan targets a minimal, working setup that Vercel can deploy as a function without emitting a static JavaScript bundle.

## Approach

### Runtime Target: Vercel Edge Functions

Export the Hono app directly from `src/index.ts` so Vercel can treat it as a function entrypoint.

```ts
// src/index.ts
import { app } from './app';

export const runtime = 'edge';
export default app;
```

### Build Setup

No Vite build is needed. Keep the package build step limited to type-checking so the deployed output stays function-based.

### App Structure (`src/app.ts`)

Direct composition — no `createApexApp` factory.

```ts
import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.redirect('https://umaxica.dev/', 301));
app.get('/health', handleHealth);
app.get('/about', handleAbout);

export { app };
```

### Routes

| Route         | Behaviour                                                                    |
| ------------- | ---------------------------------------------------------------------------- |
| `GET /`       | 301 redirect to `https://umaxica.dev/` (configurable via `DEV_CORE_URL` env) |
| `GET /health` | Fetch `${RAILS_API_URL}/edge/v0/health`, display JSON or error               |
| `GET /about`  | Static HTML describing the umaxica.dev apex domain                           |

### Vercel Config

No `vercel.json` is required. Vercel should auto-detect `src/index.ts` as the entrypoint and deploy it as a function.

### Environment Variables

| Variable        | Purpose                   | Dev value                          |
| --------------- | ------------------------- | ---------------------------------- |
| `RAILS_API_URL` | Base URL of Rails backend | `http://host.docker.internal:3000` |
| `DEV_CORE_URL`  | Redirect target for `/`   | `https://umaxica.dev`              |

## File Structure

```
dev/apex/
  src/
    app.ts          # Hono app, direct composition
    index.ts        # Vercel entry: export default app
    health.ts       # /health route handler
    about.ts        # /about route handler
  package.json
  tsconfig.json
```

## Changes to Repo Root

- `pnpm-workspace.yaml`: add `dev/apex` to packages list

## Dependencies

```json
{
  "dependencies": {
    "hono": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "@types/node": "catalog:"
  }
}
```

## Notes

- Keep the app stateless — no KV, no rate limiting (Vercel handles that at the CDN layer).
- Health route must not crash the worker when Rails is unreachable; it should return 200 with an error payload.
- No Tailwind, no JSX renderer — responses are plain HTML strings to keep the bundle tiny.

---

## Outcome

**Implemented and merged.**

### Changes Made

- `dev/apex/` workspace created with `src/app.ts`, `src/index.ts`, `package.json`, `tsconfig.json`
- `pnpm-workspace.yaml` — added `dev/apex`
- Routes: `GET /` → 301 redirect to `process.env.DEV_CORE_URL ?? 'https://umaxica.dev/'`; `GET /about` → bilingual HTML; `GET /health` → Worker's own health JSON
- Removed the Vite build path and `dev/apex/vercel.json`; Vercel should now serve the Hono function instead of the bundled source file

### Deviation from Plan

`GET /health` returns the Worker's own health status `{status:'ok', timestamp, service:'dev-apex'}` rather than proxying Rails `/edge/v0/health`. `RAILS_API_URL` is not used. This is intentional per the implementer — Rails proxy is tracked in plan/issue #247.

### Known Gap

No test files added for `dev/apex`. Consider adding smoke tests if the workspace grows.

### Verification

- `./node_modules/.bin/tsc --noEmit` in `dev/apex`: ✅ passes
- `pnpm dlx vercel build --yes`: blocked locally because the Vercel token is not valid in this environment
- `vp check` / `vp test`: not rerun here because the local `vp` wrapper currently fails to resolve `vite-plus/bin/vp`

### Note on Deletion

After implementation, it was decided that this workspace was no longer necessary, and it has been intentionally removed from the repository.

### Closes

https://github.com/seahal/umaxica-apps-jump/issues/248
