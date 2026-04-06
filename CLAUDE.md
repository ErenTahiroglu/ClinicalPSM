# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClinicalPSM is a Next.js SaaS application that lets clinical researchers run Propensity Score Matching (PSM) analysis without coding. Users upload a CSV, select treatment/covariates, and download publication-ready results (balance table, love plot, matched dataset). The PSM engine runs entirely in TypeScript in a browser-side Web Worker.

All application code lives in `clinicalpsm/`. Run all commands from that directory unless noted otherwise.

## Commands

```bash
# Development
npm run dev              # Start Next.js dev server (http://localhost:3000)

# Quality
npm run lint             # ESLint (flat config v9)
npx tsc --noEmit         # Type-check without emitting

# Tests
npm test                 # Run Vitest once
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (v8 provider)

# Build
npm run build
npm run start
```

Tests live in `src/lib/psm/__tests__/` and `src/lib/export/__tests__/`. To run a single test file:

```bash
npx vitest run src/lib/psm/__tests__/logistic.test.ts
```

CI (`.github/workflows/ci.yml`) runs lint → type-check → test on every push/PR to `main`.

## Architecture

### Request / Data Flow

```
Browser → Next.js App Router (Vercel) → Supabase (PostgreSQL + Auth + Storage)
```

**Route groups:**

- `src/app/(auth)/` — Public: login, register, forgot/reset password
- `src/app/(dashboard)/` — Protected: analyses list, new analysis wizard, analysis detail, settings
- `src/app/api/` — API routes for analyses CRUD, CSV upload, results persistence
- `src/actions/` — Server Actions for auth and profile mutations

**Middleware** (`src/middleware.ts`): redirects unauthenticated users away from dashboard routes and authenticated users away from auth routes.

### PSM Analysis Flow (the core feature)

1. **CSV Upload** — `POST /api/analyses/[id]/upload`: validates row limit (500 for free), uploads to Supabase Storage (`csv-uploads` bucket), stores column metadata in `uploads` table.
2. **Wizard** — `PsmWizard.tsx` (client component) is a 4-step state machine: upload → variable selection → matching settings → results.
3. **PSM Engine** — When the user reaches Step 4, `runPsmInWorker()` spawns a Web Worker (`src/lib/psm/worker.ts`) to avoid blocking the UI. The pipeline is:
   - `imputation.ts` → fill/drop missing values
   - `encoding.ts` → one-hot encode categorical covariates
   - `logistic.ts` → gradient-descent logistic regression → propensity scores
   - `matching.ts` → nearest-neighbor matching (with optional caliper, without replacement)
   - `balance.ts` → SMD and variance ratio before/after matching
4. **Persist Results** — `POST /api/analyses/[id]/results`: saves `PsmResult` JSONB to `analyses.result_summary`, sets status to `completed`, increments `profiles.analyses_used`.

### PSM Engine (`src/lib/psm/`)

All functions are pure (no side effects). Errors are represented as `PsmError` (defined in `types.ts`) — never throw raw JS errors from engine functions. Unit-test edge cases; the engine is the most algorithmically sensitive part of the codebase.

### Supabase Layer

- `src/lib/supabase/server.ts` — SSR-safe client (uses Next.js cookies)
- `src/lib/supabase/client.ts` — Browser client (for client components)
- Always call `auth.getUser()` to validate the session in API routes/server actions. Never rely on RLS alone; also add explicit `user_id` filters in every query.

### Database Schema

```
profiles        — user plan, analyses_used, analyses_limit, Polar.sh billing fields
analyses        — status, config (JSONB), result_summary (JSONB), timestamps
uploads         — Supabase Storage file_path, row_count, column_names
```

Migrations are in `supabase/migrations/` and applied via `npx supabase db push`. A Postgres trigger auto-creates a `profiles` row on signup.

### Quota & Rate Limiting

- Quota enforced server-side: `POST /api/analyses` checks `analyses_used < analyses_limit`, increments on result save.
- Rate limiter (`src/lib/rate-limit.ts`): in-memory sliding window, 10 req/min per IP. Suitable for single-instance; upgrade to Redis for multi-instance.
- Plans: Free (3 total), Plus (25/month), Pro (unlimited). Payment via Polar.sh is planned for v0.2.

## Key Conventions

- **Server Components by default** — add `"use client"` only where `useState`/`useEffect`/event handlers are needed.
- **TypeScript strict mode** — no `any`; use `unknown` with type guards where needed.
- **Path alias** — `@/*` maps to `src/*` (configured in `tsconfig.json`).
- **Styling** — Tailwind CSS v4 + shadcn/ui (base-nova theme). Component variants use `class-variance-authority`.
- **Detailed guidelines** are in `clinicalpsm/docs/skills/`: `clean-code.md`, `nextjs-app-router.md`, `psm-engine.md`, `supabase-db.md`. Read the relevant one before making architectural decisions in that domain.

## Environment Variables

Copy `clinicalpsm/.env.local.example` to `clinicalpsm/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Polar.sh (only for v0.2 paid plans):
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
NEXT_PUBLIC_POLAR_PLUS_PRODUCT_ID=
NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID=
```

After linking Supabase, manually create the `csv-uploads` storage bucket (private) and verify RLS policies on all tables.

## Communication Style

- I give terse directives. "go", "yes", "1" mean proceed immediately.
- "too much" / "too little" means adjust the last change by ~30%.
- I iterate visually -- expect 3-10 rounds of refinement on UI changes.
- Don't ask for confirmation on visual tweaks, just make the change.
- When I paste an error, fix it. Don't explain what went wrong unless asked.
- Keep responses short. Don't narrate what you're about to do.
- Speak like caveman. Short 3-6 word sentences. No filler, no pleasantries.
- Run tools first, show results, then stop. No narration on actions.
- Drop articles (a, an, the). Say "me fix code" not "I will fix the code".
- Shorter response always better. Concise descriptions only.
- Focus strictly on code outputs. Provide raw code blocks. Do not wrap code in conversational context.
