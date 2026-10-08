# SEC-00 R1: Inventory Adjudication Procedure (metadata only; owner-run; nothing here was executed by me)

Owner-provided production counts (2026-10-08, **not independently verified**): `auth.users` 2, `profiles` 1, `analyses` 0, `uploads` 0, `analysis_cache` 0, `audit_logs` 6, `storage.objects` 0.
Note: the Supabase connector's `list_tables` row figures show 0 for every table, including `auth.users`; those are planner statistics, not counts, so they neither confirm nor contradict the owner's numbers. Only `count(*)` run by the owner counts.

Rules: run queries in the Supabase SQL editor (production, read-only SELECTs). Do **not** paste results containing emails, user ids, IP addresses, names or metadata values into chat, Git, reports or any Claude session. Report only the yes/no answers and counts requested in section 6. No query below reads clinical content; none returns a row from `analyses`, `uploads`, `analysis_cache` or `storage.objects` (they are empty by the owner's count; the checks use statistics only).

## 1. Do both Auth users belong to the owner?
Step A, on the owner's computer (macOS): compute the fingerprint of each email address you own, lowercase, first 8 hex characters. The address never leaves the machine.
```
printf '%s' 'your.address@example.edu' | tr 'A-Z' 'a-z' | md5 | cut -c1-8
```
Step B, in the SQL editor (returns fingerprints and coarse attributes, no address):
```sql
SELECT left(md5(lower(email)),8) AS email_fp8,
       created_at::date            AS created,
       last_sign_in_at::date       AS last_sign_in,
       (email_confirmed_at IS NOT NULL) AS confirmed,
       raw_app_meta_data->>'provider'   AS provider,
       is_anonymous, (banned_until IS NOT NULL) AS banned,
       (email ~* '\.edu(\.tr)?$')  AS edu_domain,
       (SELECT count(*) FROM auth.identities i WHERE i.user_id = u.id) AS identities,
       (SELECT count(*) FROM auth.sessions s WHERE s.user_id = u.id)  AS sessions
FROM auth.users u ORDER BY created_at;
```
Compare `email_fp8` with your Step A values. **Both** rows must match addresses you control. A row you cannot match = third-party personal data = **BLOCKED** (section 5). A user created after 2026-04-09 21:12 UTC (project creation) whose `last_sign_in` is not a day you used the site also needs an explanation.

## 2. Why does only one user have a profile?
```sql
SELECT u.created_at AS user_created, (p.user_id IS NOT NULL) AS has_profile, p.plan, p.created_at AS profile_created
FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id ORDER BY u.created_at;
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
SELECT to_regprocedure('public.handle_new_user()') IS NOT NULL AS fn_exists;
SELECT relname, n_tup_ins, n_tup_del, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' AND relname='profiles';
```
Interpretation (hypotheses to test, not conclusions): (a) the user without a profile signed up before the `handle_new_user` trigger existed (user_created earlier than the first profile and the trigger/function now exist) = benign; (b) the trigger is absent or disabled = schema drift to explain (the live schema already differs from the repo); (c) `profiles.n_tup_del > 0` or `n_tup_ins` greater than the live row count = a profile row was deleted at some point (find out why); (d) the user was created through the dashboard or a flow that bypasses the trigger. Record which hypothesis the evidence supports. Unexplained = **BLOCKED**.

## 3. Do the six audit records need retention or incident review?
Keys only, no values:
```sql
SELECT action, resource_type, timestamp::date AS day, count(*) FROM public.audit_logs GROUP BY 1,2,3 ORDER BY 3;
SELECT k AS metadata_key, count(*) FROM public.audit_logs, LATERAL jsonb_object_keys(coalesce(metadata,'{}'::jsonb)) k GROUP BY 1 ORDER BY 2 DESC;
SELECT count(DISTINCT user_id) AS distinct_user_ids, count(DISTINCT ip_address) AS distinct_ips,
       count(*) FILTER (WHERE user_id !~ '^[0-9a-f-]{36}$') AS non_uuid_user_ids FROM public.audit_logs;
SELECT left(md5(ip_address),8) AS ip_fp8, count(*) FROM public.audit_logs GROUP BY 1;   -- compare with md5 of your own IPs, computed locally as in section 1
```
Triggers for retention / incident review: any `FILE_UPLOADED` action; any metadata key among `fileName`, `file_name`, `column_names`, `error_stack`, `error_message`, `userAgent`, `url`, `body` (old code stored these; their values may identify people or files); any `RATE_LIMIT_EXCEEDED` or `SUSPICIOUS_ACTIVITY` (possible outsider activity); a `distinct_user_ids` or IP fingerprint that is not yours; entries dated outside the days you were working. None of these = low value but still a personal-data record about you; keep or delete by your choice.

## 4. Could historical clinical data exist outside the counted tables or Storage objects?
Lifetime statistics show whether rows were ever written even if they were later deleted (deleted rows can remain in backups and in dead tuples until vacuum):
```sql
SELECT schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
FROM pg_stat_user_tables WHERE schemaname IN ('public','storage') ORDER BY 1,2;
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();
SELECT n.nspname, c.relname, c.relkind, pg_total_relation_size(c.oid) AS bytes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND c.relkind IN ('r','p','m','f')
ORDER BY bytes DESC LIMIT 40;                                   -- unexpected tables or large relations
SELECT count(*) AS large_objects FROM pg_largeobject_metadata;
SELECT n.nspname, count(*) AS functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema','auth','storage','extensions','graphql','graphql_public','realtime','vault','net','pgsodium','pgsodium_masks','supabase_functions','_realtime','pgbouncer') GROUP BY 1;
SELECT count(*) AS vault_secrets FROM vault.secrets;
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
SELECT id, public FROM storage.buckets;                           -- bucket names are infrastructure, not data
SELECT count(*) FROM storage.objects;                              -- expected 0
```
Reading the result: `analyses`/`uploads`/`analysis_cache` with `n_tup_ins = 0` since `stats_reset` (or since project creation if reset is null) = no rows ever written in that window; **`n_tup_ins > 0` with 0 live rows = data existed and was deleted: treat as Path B (possible historical records in provider backups/WAL)**. Any non-standard table, a large unexpected relation, a non-zero `large_objects`, a non-zero `vault_secrets` you did not create, or stats reset recently (so absence of inserts proves little) = unexplained = **BLOCKED**. Supabase connector facts already known (metadata only): the database has exactly five application tables, no Edge Functions, installed extensions `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`, `plpgsql`.

## 5. Classification
| Outcome | Classification |
|---|---|
| Both users matched to the owner; profile gap explained; audit records contain only owner activity with no upload/file/stack metadata; `analyses`/`uploads`/`analysis_cache` never received rows; no unexpected relations or large objects; Storage empty and bucket stats show no inserts | **Owner-only synthetic: Path A may proceed** (owner + Red Team approval still required) |
| Any user not matched; any unexplained profile gap; any upload-related audit record; any lifetime inserts into data tables; any unexpected relation/large object/vault secret; statistics too recent to prove absence | **BLOCKED**: Path B (contain, assess with counsel, no deletion) |
| Query errors or permissions prevent a check | BLOCKED until completed |
Unless the owner establishes the Path A row, the retirement decision stays BLOCKED.

## 6. What to send back (and nothing else)
Counts and yes/no only: users matched (n of 2); profile-gap hypothesis (a/b/c/d); audit: number of records with upload/file-related action, with sensitive metadata keys, with non-owner user id or IP fingerprint; `n_tup_ins` for `analyses`, `uploads`, `analysis_cache`, `storage.objects` (numbers); unexpected relations (count); large objects (number); vault secrets (number); `stats_reset` present (yes/no).

## 7. Does Auth/audit data need an encrypted archive?
- `auth.users` holds email addresses and bcrypt password hashes; `audit_logs` holds IP addresses and possibly filenames/stacks. These are personal data even when they are only the owner's.
- **Path A (owner-only, nothing else):** an archive is optional. If the owner wants a record, store only `auth.users` metadata the owner already knows (nothing needed) or a count sheet; delete the rest with the project. If an archive of the rows themselves is kept, it must be `age`-encrypted (see `SEC-00-SUPABASE-INVENTORY-AND-BACKUP.md` section 8), never in Git or the research folder.
- **Any third-party user or doubtful audit record:** do not delete; take one encrypted archive of `auth.users` (exclude `encrypted_password`: select columns explicitly), `auth.identities` and `public.audit_logs`, then let counsel decide retention/deletion and notification.
