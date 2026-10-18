# SEC-00: Supabase Free Inventory and Manual Backup Procedure (operator-run; nothing here was executed against production)

Facts from Supabase documentation (fetched 2026-10-08): automatic daily backups exist only for Pro/Team/Enterprise; Free projects are advised to export regularly with the CLI and keep off-site copies; database backups do **not** include objects stored via the Storage API; restoring makes the project inaccessible; custom-role passwords, Vault root encryption key, extensions, webhooks and replication slots need separate handling. Official dump commands use `supabase db dump` (roles, schema, data with `--use-copy --data-only`) and restore with `psql --single-transaction`. Direct connections (`db.<ref>.supabase.co:5432`, IPv6) are for `pg_dump`; the shared pooler (session mode) is the IPv4 alternative with user `postgres.<ref>`. Use `sslmode=require` at minimum (`verify-full` with the downloaded root certificate is stronger).

Rules for this procedure: the owner authorizes any production export in writing first; no connection string containing a password goes into Git, shell history, reports or chat; no row contents are displayed or inspected; Supabase is not deleted or paused.

## 0. Credential hygiene for every command below
```
# once per terminal session; the password is never written to history or a file in the repo
read -rs PGPASSWORD; export PGPASSWORD          # paste the CURRENT (rotated) password, press Enter
export PGHOST=db.vmfypftkayycndvgpfrj.supabase.co PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGSSLMODE=require
# if your network has no IPv6: use the Session pooler host from the dashboard "Connect" dialog and PGUSER=postgres.vmfypftkayycndvgpfrj
unset HISTFILE   # or run the commands in a shell started with HISTFILE unset
```
Close the terminal (or `unset PGPASSWORD`) when finished. Prefer a **read-only role** for inventory and dumps: create it yourself in the dashboard SQL editor (`CREATE ROLE sec00_reader LOGIN PASSWORD '<generated, not shared>'; GRANT pg_read_all_data TO sec00_reader;`) and drop it afterwards; `pg_read_all_data` is a built-in role. (Creating a role is a production change: only with the owner's approval.)

## 1. Read-only metadata inventory (counts and dates only; never `SELECT *`)
Run in the dashboard SQL editor, or with `psql -X -v ON_ERROR_STOP=1 -c "<query>"` using the environment above. Use the queries in `docs/operations/CP-00-SUPABASE-RETIREMENT-OPTIONS.md` section 2, plus:
```sql
SELECT n.nspname AS schema, c.relname AS table, c.reltuples::bigint AS approx_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('public','storage','auth') ORDER BY 1,2;     -- statistics estimate only
SELECT count(*) AS roles_with_login FROM pg_roles WHERE rolcanlogin;
SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY 1;  -- names only
SELECT extname, extversion FROM pg_extension ORDER BY 1;
SELECT count(*) FROM vault.secrets;   -- count only; skip if the vault schema is absent
SELECT count(*) AS webhook_triggers FROM pg_trigger WHERE tgname LIKE 'supabase_functions%';
```
Read-only configuration facts already collected via the connected Supabase connector (metadata only, 2026-10-08): project `ClinicalPSM`, ref `vmfypftkayycndvgpfrj`, region `eu-west-1`, status `ACTIVE_HEALTHY`, Postgres 17.6, created 2026-04-09; applied migrations: 001-009 only (**010, 011, 012 are not applied**); security advisor: `public.cleanup_expired_cache()`, `public.handle_new_user()` and `public.rls_auto_enable()` are SECURITY DEFINER functions executable by `anon` and `authenticated`; Auth leaked-password protection disabled. `rls_auto_enable` does not exist in the repository migrations, so the live schema has drifted from the repo and must be diffed before any restore or migration.

## 2. Decision gate before any data export
| Inventory result | Action |
|---|---|
| All of `auth.users`, `profiles`, `analyses`, `uploads`, `analysis_cache`, `storage.objects` are 0 or only the owner's confirmed synthetic rows | Schema-only backup (3.1) is enough; a data dump is optional |
| Any other row, any `uploads`/`result_summary`/CSV object, any unknown table, any `FILE_UPLOADED` audit rows | **STOP.** Do not export data. Treat as potential protected clinical data: escalate to the owner and legal/privacy counsel. A schema-only dump remains allowed |
| Counts cannot be obtained (permission error) | STOP and report; do not widen privileges ad hoc |

## 3. Backup (only the tiers the gate allows)
Install `supabase` CLI (or use `pg_dump`) and `age` (`brew install age`) from their official sources; verify versions.
### 3.1 Schema and roles (no row data): always allowed
```
mkdir -p ~/sec00-backup && chmod 700 ~/sec00-backup && cd ~/sec00-backup
pg_dump --schema-only --no-owner --no-privileges -Fc -f schema-$(date +%F).dump
pg_dumpall --roles-only --no-role-passwords -f roles-$(date +%F).sql      # role names/attributes only
```
(Equivalent: `supabase db dump --db-url "$URL" -f schema.sql`, but the URL then carries the password in the process list; prefer `pg_dump` with the environment above.)
### 3.2 Data (only after the gate and written owner authorization)
```
pg_dump --data-only --no-owner -Fc --exclude-schema=auth_audit -f data-$(date +%F).dump   # extend exclusions per inventory
```
Supabase documents `--use-copy --data-only` via its CLI for restores; `pg_dump -Fc` produces a TOC-based archive that can be verified without reading rows.
### 3.3 Encrypt immediately, delete plaintext
```
age-keygen -o ~/sec00-backup/backup-key.txt          # keep the private key OFFLINE and separate from the archive; print only the public key
age -r <PUBLIC_KEY> -o data-$(date +%F).dump.age data-$(date +%F).dump && shred -u data-$(date +%F).dump 2>/dev/null || rm -P data-$(date +%F).dump
shasum -a 256 *.age > SHA256SUMS
```
Never store the archive or key in the repository, Vercel, or a synced cloud folder. Keep two copies on separate owner-controlled media.

## 4. Integrity verification without exposing rows
1. `shasum -a 256 -c SHA256SUMS`.
2. Decrypt to a pipe and list the table of contents only: `age -d -i backup-key.txt data-<date>.dump.age | pg_restore --list | head -50` (object names, no data).
3. Compare the number of TOC entries and table names with the inventory sheet; record counts per table from the **inventory query** at dump time (not from the dump).
4. Optional full test restore into a **local throwaway PostgreSQL 17** (Docker/local install), never into the production project; row counts are compared programmatically and printed as numbers only.

## 5. Storage objects (separate treatment)
Database dumps exclude Storage objects. Inventory with counts and total bytes only (`SELECT bucket_id, count(*), sum((metadata->>'size')::bigint) FROM storage.objects GROUP BY 1`). If objects exist beyond owner-confirmed synthetic ones: STOP (clinical file risk). If a copy is authorized, use the Storage API with a service credential that you create for the purpose and revoke afterwards (Supabase provides a Node.js copy script in its backup/restore guide); encrypt with `age` as above; verify by checksum list of object keys (keys may be identifying: keep the list inside the encrypted archive).

## 6. Restore prerequisites (for later use; a restore is a production change needing approval)
Target: a **new** project or local PostgreSQL (restoring over the live project is destructive and makes it inaccessible). Enable the same extensions first; re-create webhooks; drop subscriptions/replication slots before restore; set passwords for custom LOGIN roles; retrieve the Vault root key before any pause/delete (backups do not contain it); apply `roles.sql` then `schema.sql`, then data with `session_replication_role = replica`, all in `--single-transaction` with `ON_ERROR_STOP=1`; Storage objects restored separately; re-run the CP-00 verification SQL afterward.

## 7. Explicit stop conditions
Unexpected rows or objects; unknown schemas/tables; schema drift that the repo cannot explain (see `rls_auto_enable`); any prompt to enter or paste a connection string into a shared place; any need to disable TLS verification; evidence of unfamiliar logins in the logs. In each case: stop, preserve evidence, report.

## 8. R1 minimal verified procedure (supersedes sections 3.1-3.3 where they differ)
Verified against Supabase documentation (2026-10-08): `supabase db dump` **excludes the `auth` and `storage` schemas and extension schemas by default**, so it does not back up Auth users or Storage metadata; use `pg_dump -n auth` for Auth. The CLI's `-p/--password` flag puts the password in the process arguments (visible in `ps`): do not use it. Database dumps never contain Storage objects. Free projects have no automatic backups.

### 8.0 Where backup material lives (hard rules)
- Create the directory **outside every Git repository and outside `~/Documents/GitHub`** (so neither Git nor the Claude/CBM/Graphify indexers can see it), e.g. on an encrypted external volume or `~/SEC00-BACKUP-2026-10-08` with `chmod 700`:
  ```
  d=~/SEC00-BACKUP-$(date +%F); mkdir -m 700 "$d" && cd "$d"
  git rev-parse --is-inside-work-tree 2>/dev/null && { echo "STOP: inside a Git work tree"; exit 1; }
  ```
- Never run Claude (or any coding agent) with that directory as working directory; never paste its content, hashes of rows, or the age key into chat.
- The age private key is stored offline on separate media; only the **public** key is used on the machine that makes the archive.

### 8.1 Tier 1: schema and roles only (no data; always allowed)
```
pg_dump --schema-only --no-owner --no-privileges -Fc -f schema-public-$(date +%F).dump -n public     # application schema
pg_dump --schema-only --no-owner --no-privileges -Fc -f schema-auth-$(date +%F).dump   -n auth       # optional, Supabase-managed
pg_dumpall --roles-only --no-role-passwords -f roles-$(date +%F).sql
```
### 8.2 Tier 2: Auth and audit data (only after the section 2 gate and written owner approval)
Contains emails, IP addresses and (in `auth.users`) password hashes: treat as personal data.
```
# application tables (no Auth): audit trail and profile
pg_dump --data-only --no-owner -Fc -t public.audit_logs -t public.profiles -f data-public-$(date +%F).dump
# Auth without password hashes: explicit columns through psql \copy (pg_dump cannot select columns)
psql -X -v ON_ERROR_STOP=1 -c "\copy (SELECT id, created_at, last_sign_in_at, email_confirmed_at, raw_app_meta_data, is_anonymous FROM auth.users ORDER BY created_at) TO 'auth-users-nohash-$(date +%F).csv' CSV HEADER"
```
(If the owner wants the account **restorable** (hash included), run `pg_dump --data-only -t auth.users -t auth.identities` instead and treat the archive as high sensitivity.)
### 8.3 Tier 3: Storage objects
Inventory shows 0 objects: nothing to copy. If that changes, STOP (clinical file risk) and follow section 5.
### 8.4 Encrypt, verify, destroy plaintext
```
for f in *.dump *.csv *.sql; do age -r "$AGE_PUBLIC_KEY" -o "$f.age" "$f" && rm -P "$f"; done
shasum -a 256 *.age > SHA256SUMS
shasum -a 256 -c SHA256SUMS                                           # integrity of the ciphertext
age -d -i /path/to/OFFLINE/age-key.txt data-public-*.dump.age | pg_restore --list | head -40    # TOC only, no rows
```
Record, as numbers only, the counts from the inventory query next to the archive names. Make two copies on separate media. A full test restore is done only into a throwaway local PostgreSQL 17, never production.
### 8.5 Not backed up by any of the above (document the consequence)
Auth settings, SMTP/OAuth configuration and API keys (Supabase: not stored in the database); Vault root encryption key (retrieve before pause/delete if `vault.secrets` is non-empty); webhooks; Edge Functions (none); Storage objects.
