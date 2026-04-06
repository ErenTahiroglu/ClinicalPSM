# 🏥 GEMINI Context & Instructions: ClinicalPSM

Welcome to the ClinicalPSM project. This document provides essential context and instructions to help you work effectively within this codebase.

## 📖 Project Overview

ClinicalPSM is a specialized SaaS application designed for clinical researchers to perform Propensity Score Matching (PSM) without coding. It allows users to upload clinical data, select treatment/covariates, and perform statistical matching to reduce selection bias.

## 🛠️ Core Technologies

- **Framework:** Next.js 16 (App Router) + TypeScript.
- **Styling:** Tailwind CSS v4 + shadcn/ui.
- **Backend/Auth:** Supabase (PostgreSQL, Auth, Storage).
- **PSM Engine:** Currently client-side TypeScript (`clinicalpsm/src/lib/psm/`).
- **Payments:** Polar.sh (planned).
- **Hosting:** Vercel.

## 🏗️ Architectural Patterns

- **Next.js App Router:** Following standard conventions for route groups, layouts, and server/client components.
- **Route Groups:** `(auth)` for authentication, `(dashboard)` for protected analysis tools.
- **Modular PSM Engine:** Logic is decoupled in `clinicalpsm/src/lib/psm/`.

## 📜 Critical Development Rules

1. **Source Directory:** All main application code is located in the `clinicalpsm/` directory.
2. **Coding Standards:**
   - Adhere to the "Clean Code" principles defined in `clinicalpsm/docs/skills/clean-code.md`.
   - Use Next.js App Router best practices (`clinicalpsm/docs/skills/nextjs-app-router.md`).
   - Follow Supabase database patterns (`clinicalpsm/docs/skills/supabase-db.md`).
3. **Statistical Integrity:** When modifying the PSM engine, refer to `clinicalpsm/docs/skills/psm-engine.md`. Ensure mathematical accuracy.
4. **UI/UX:** Use Tailwind CSS v4 and shadcn/ui components. Maintain a clean, academic/medical aesthetic.
5. **No Hallucinations:** Use only the existing tech stack. If you need to install a new package, propose it first.

## 📂 Key Directories

- `clinicalpsm/src/app`: Application routes and layouts.
- `clinicalpsm/src/components`: UI components (analysis-specific, shared, and shadcn/ui).
- `clinicalpsm/src/lib`: Core logic (PSM engine, export utilities, Supabase helpers).
- `clinicalpsm/supabase`: Database migrations and configuration.
- `clinicalpsm/docs`: Detailed architectural and skill documentation.

## 🚀 Common Commands

From the root:

- **Dev Server:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`

From `clinicalpsm/`:

- **Supabase Local:** `npx supabase start`
- **Test:** `npm test` (using Vitest)

Refer to `clinicalpsm/README.md` and `clinicalpsm/docs/architecture.md` for more detailed information.

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
- Execute function calls/tools silently. Output raw data from tools, nothing else.
