# ClinicalPSM

Propensity Score Matching (PSM) for clinical researchers — no coding required.

Upload a CSV, select your treatment and covariates, run the analysis, and download publication-ready results.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (base-nova) |
| Auth + DB | Supabase (Auth, PostgreSQL, Storage, RLS) |
| PSM Engine | TypeScript (browser-side Web Worker) |
| Payments | Polar.sh (planned — v0.2) |
| Hosting | Vercel |
| Testing | Vitest |
| CI | GitHub Actions |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### Local Development

```bash
cd clinicalpsm

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in your Supabase URL, anon key, and service role key

# Apply database migrations
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
clinicalpsm/
├── src/
│   ├── actions/          # Server actions (auth, profile)
│   ├── app/
│   │   ├── (auth)/           # Login, register, forgot/reset password
│   │   ├── (dashboard)/      # Protected: analyses list, wizard, detail, settings
│   │   ├── api/              # API routes (analyses CRUD, file upload, results)
│   │   ├── pricing/          # Pricing page
│   │   └── page.tsx          # Landing page
│   ├── components/
│   │   ├── analysis/         # PSM wizard steps, love plot, histogram, export
│   │   ├── settings/         # Settings page client component
│   │   ├── shared/           # Header
│   │   └── ui/               # shadcn/ui components
│   ├── lib/
│   │   ├── psm/              # PSM engine + Web Worker + tests
│   │   ├── export/           # CSV, balance-table, SVG→PNG + tests
│   │   ├── rate-limit.ts     # In-memory rate limiter
│   │   └── supabase/         # Client and server helpers
│   └── types/                # TypeScript type definitions
├── supabase/
│   └── migrations/           # SQL migrations (001–004)
├── .github/
│   └── workflows/ci.yml      # Lint + type-check + tests on push/PR
└── docs/
    ├── architecture.md       # Technical architecture
    └── skills/               # AI coding guidelines
```

---

## Plans

| Plan | Analyses | Price |
|---|---|---|
| Free | 3 total | $0 |
| Plus | 25/month | $5/mo |
| Pro | Unlimited | $20/mo |

Payment integration (Polar.sh) is planned for v0.2.

---

## Supabase Setup

After linking your project:

1. **Create storage bucket** in the Supabase dashboard: `csv-uploads` (private)
2. **Add RLS policies** for the bucket so users can only access their own files
3. **Set Auth URLs**: Site URL + redirect URL to your production domain

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=
```

Polar.sh variables (`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, product IDs) are only needed when enabling paid plans.

---

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest (unit tests)
npm run test:watch   # Vitest watch mode
npm run test:coverage  # Coverage report
```

---

## Roadmap

- **v0.2** — Polar.sh payment integration (Plus & Pro plans)
- **v0.3** — Python/FastAPI PSM engine (scikit-learn, larger datasets)
- **v0.4** — Excel (.xlsx) support
- **v0.5** — Multi-language support (Spanish)
