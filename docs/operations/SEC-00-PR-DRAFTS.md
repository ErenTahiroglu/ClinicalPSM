# SEC-00: Draft Pull Requests (prepared, NOT opened)

Opening a PR to `main` triggers `ci.yml` (currently failing on `main` since 2026-04-17) and a Vercel preview build (protected by Vercel Authentication). Nothing is merged without Red Team approval; merging into `main` redeploys production.

## PR 0 (do first, separate): `ci/sec-00-main-ci-node24` -> `main` (commit `2c1b405`, 1 line)
Title: `CI: run on Node 24 (npm 11) so npm ci matches the lockfile`
Cause reproduced locally on `main` `dfa475b`: `npx npm@10 ci` fails with "Missing: @swc/helpers@0.5.23 from lock file" (a Node 20 runner ships npm 10); `npm@11 ci` succeeds. Vercel's project already uses Node 24.x. The same change passed `npm ci`, lint, type-check, tests and build on GitHub runners in the SEC-00 branches. Not yet run on GitHub as a PR to `main`.

## PR 1: `security/sec-00-untrack-vscode-main` -> `main` (commit `fe7f5e7`, 2 files)
Title: `SEC-00: stop tracking editor connection settings`
Body:
> Removes `.vscode/settings.json` (a saved SQL-client connection holding a database credential that was exposed in history since 2026-04-10) and ignores it. The credential belonged to a Supabase project that no longer exists (owner statement; DNS NXDOMAIN) and was rotated. History is not rewritten. Current tracked tree: Gitleaks `dir` scan 0 findings. No application code changed.
Verification evidence: tracked-tree scan 0 findings; diff = `.gitignore` (+5) and the file deletion (−20).
Command: `gh pr create --draft --base main --head security/sec-00-untrack-vscode-main --title "SEC-00: stop tracking editor connection settings" --body-file <body>`

## PR 2: `security/sec-00-untrack-vscode-cp00` -> `phase/cp-00-safety-containment` (commit `7067f7f`, 2 files)
Same body, target the CP-00 branch (`1bc924d`), so the audited branch tip no longer tracks the file. Merge only after Red Team agrees that adding a commit to the audited branch is acceptable (alternative: fold into the CP-00 -> main PR).

## PR 3 (separate, later): CP-00 branch -> `main`
Not prepared as a PR here; requires the Red Team decision on CP-00 closure, a deployment order (database migrations on a branch first), and a green `main` CI.
