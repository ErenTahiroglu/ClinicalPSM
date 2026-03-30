# ClinicalPSM

Propensity Score Matching (PSM) for clinical researchers — no coding required.

Upload a CSV, select your treatment and covariates, run the analysis, and download publication-ready results.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth + DB | Supabase (Auth, PostgreSQL, Storage) |
| PSM Engine | TypeScript (browser-side, MVP) |
| Payments | Polar.sh (coming in v0.2) |
| Hosting | Vercel |

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
│   ├── app/
│   │   ├── (auth)/           # Login & register pages
│   │   ├── (dashboard)/      # Protected: analyses list & PSM wizard
│   │   ├── api/              # API routes (analyses, webhooks)
│   │   ├── pricing/          # Pricing page
│   │   └── page.tsx          # Landing page
│   ├── components/
│   │   ├── analysis/         # PSM wizard steps, love plot, result detail
│   │   ├── shared/           # Header
│   │   └── ui/               # shadcn/ui components
│   ├── lib/
│   │   ├── psm/              # PSM engine: logistic.ts, matching.ts, balance.ts
│   │   ├── export/           # CSV export
│   │   └── supabase/         # Supabase client & server helpers
│   └── types/                # TypeScript type definitions
├── supabase/
│   └── migrations/           # SQL migrations (001 schema, 002 plans, 003 indexes)
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

After linking your project, you need to manually:

1. **Create storage bucket** in the Supabase dashboard: `csv-uploads` (private)
2. **Add RLS policies** for the bucket so users can only access their own files
3. **Set Auth URLs**: Site URL + redirect URL to your production domain

---

## Environment Variables

See `.env.local.example` for the full list. Required variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=
```

---

## Roadmap

- **v0.2** — Polar.sh payment integration (Plus & Pro plans)
- **v0.3** — Python/FastAPI PSM engine (scikit-learn)
- **v0.4** — PDF & DOCX export
- **v0.5** — Multi-language support
