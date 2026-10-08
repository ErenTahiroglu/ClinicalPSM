#!/usr/bin/env bash
# Scanner self-test with SYNTHETIC data generated at run time (nothing secret-like is committed).
set -euo pipefail
GL="$1"; ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok(){ echo "PASS  $1"; pass=$((pass+1)); }; bad(){ echo "FAIL  $1"; fail=$((fail+1)); }
rand(){ python3 -c "import secrets,string,sys;a=string.ascii_letters+string.digits;print(''.join(secrets.choice(a) for _ in range(int(sys.argv[1]))),end='')" "$1"; }

# positive 1: GitHub-PAT-shaped random token
mkdir -p "$tmp/pos1"; printf 'token = "ghp_%s"\n' "$(rand 36)" > "$tmp/pos1/config.txt"
# positive 2: Stripe-live-key-shaped random token
mkdir -p "$tmp/pos2"; printf 'STRIPE = sk_live_%s\n' "$(rand 24)" > "$tmp/pos2/.env"
# positive 3: private key block header with random body
mkdir -p "$tmp/pos3"; # markers are assembled at run time so this script itself never contains a key-block literal
b="-----BEGIN RSA PRIVATE"; e="-----END RSA PRIVATE"
{ echo "$b KEY-----"; for _ in 1 2 3 4 5; do rand 64; echo; done; echo "$e KEY-----"; } > "$tmp/pos3/key.pem"
# negative: benign text, placeholders and code that merely mentions secrets
mkdir -p "$tmp/neg"; cat > "$tmp/neg/readme.md" <<'EON'
Set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key in .env.local (placeholder).
const token = process.env.POLAR_WEBHOOK_SECRET
password = "<redacted>"
EON
for d in pos1 pos2 pos3; do
  set +e; "$GL" dir "$tmp/$d" --config "$ROOT/.gitleaks.toml" --redact=100 --no-banner --log-level error --report-path "$tmp/$d.json" --report-format json >/dev/null 2>&1; rc=$?; set -e
  if [ $rc -eq 1 ] && [ -s "$tmp/$d.json" ]; then ok "detects synthetic secret ($d)"; else bad "did NOT detect synthetic secret ($d) rc=$rc"; fi
  # redaction: no 20+ char alphanumeric run from the fixture may appear in the report
  if python3 - "$tmp/$d.json" "$tmp/$d" <<'EOP'
import sys,re,os,json
rep=open(sys.argv[1]).read()
for root,_,fs in os.walk(sys.argv[2]):
    for f in fs:
        for run in re.findall(r'[A-Za-z0-9]{24,}', open(os.path.join(root,f)).read()):
            if run in rep: sys.exit(1)
sys.exit(0)
EOP
  then ok "report for $d is redacted"; else bad "report for $d leaks the synthetic value"; fi
done
set +e; "$GL" dir "$tmp/neg" --config "$ROOT/.gitleaks.toml" --redact=100 --no-banner --log-level error >/dev/null 2>&1; rc=$?; set -e
[ $rc -eq 0 ] && ok "benign/placeholder file passes" || bad "false positive on benign fixture rc=$rc"

# ---- baseline semantics: a historical exception must not excuse reappearance, and current files must stay clean ----
repo="$tmp/repo"; mkdir -p "$repo"; cd "$repo"
g(){ git -c user.name=t -c user.email=t@example.test -c commit.gpgsign=false "$@"; }
g init -q .; tokfile="$tmp/tok"; printf 'ghp_%s' "$(rand 36)" > "$tokfile"
printf 'token = "%s"\n' "$(cat "$tokfile")" > old.txt; g add old.txt; g commit -qm "historical synthetic leak"
set +e
"$GL" git . --redact=100 --no-banner --log-level error --report-path "$tmp/base.json" --report-format json >/dev/null 2>&1
[ -s "$tmp/base.json" ] && ok "historical synthetic finding is detected and baselined (visible)" || bad "baseline fixture produced no finding"
"$GL" git . --redact=100 --no-banner --log-level error --baseline-path "$tmp/base.json" >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && ok "baselined historical finding does not fail the history gate" || bad "baseline did not tolerate the known finding rc=$rc"
"$GL" git . --redact=100 --no-banner --log-level error >/dev/null 2>&1; rc=$?
[ $rc -eq 1 ] && ok "without the baseline the historical finding is still reported (not erased)" || bad "history scan without baseline rc=$rc"
# current-tree gate must FAIL while the old file is still tracked (baseline is irrelevant to it)
mkdir -p "$tmp/cur1"; git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$tmp/cur1"
"$GL" dir "$tmp/cur1" --redact=100 --no-banner --log-level error >/dev/null 2>&1; rc=$?
[ $rc -eq 1 ] && ok "current-tree scan fails while a live secret is still tracked (baseline cannot excuse it)" || bad "current-tree scan rc=$rc"
# the same secret re-added in a NEW file/commit must fail the baseline-aware history gate
printf 'again = "%s"\n' "$(cat "$tokfile")" > new.txt; g add new.txt; g commit -qm "reintroduce"
"$GL" git . --redact=100 --no-banner --log-level error --baseline-path "$tmp/base.json" >/dev/null 2>&1; rc=$?
[ $rc -eq 1 ] && ok "reintroduced secret fails despite the baseline" || bad "reintroduction not detected rc=$rc"
# remediation: remove both files -> current tree clean again
g rm -q old.txt new.txt; g commit -qm "remove"; mkdir -p "$tmp/cur2"
git ls-files -z | tar --null -T - -cf - 2>/dev/null | tar -xf - -C "$tmp/cur2"
"$GL" dir "$tmp/cur2" --redact=100 --no-banner --log-level error >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && ok "current-tree scan passes once the secret is removed from tracked files" || bad "current-tree scan after removal rc=$rc"
set -e; cd "$ROOT"
echo "selftest: $pass passed, $fail failed"; [ $fail -eq 0 ]
