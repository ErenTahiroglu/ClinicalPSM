#!/usr/bin/env bash
# Read-only verification of SEC-00 operational containment. Public HTTP GETs only: no login, no writes, no credentials.
#   SUPABASE_PUBLISHABLE_KEY must be the project's PUBLIC publishable/anon key (it is embedded in the website's JavaScript).
# Output per check: PASS (containment in effect) / FAIL (still exposed) / UNKNOWN (cannot be checked from the outside).
set -uo pipefail
REF="${SUPABASE_PROJECT_REF:-vmfypftkayycndvgpfrj}"; KEY="${SUPABASE_PUBLISHABLE_KEY:-}"
HOSTS="${PROD_HOSTS:-www.clinicalpsm.com clinicalpsm.com}"
rc=0; res(){ printf '%-9s %s\n' "$1" "$2"; [ "$1" = FAIL ] && rc=1; true; }

echo "== 1. Vercel Deployment Protection must cover the PRODUCTION custom domains (scope: All Deployments)"
for h in $HOSTS; do
  loc="$(curl -s -o /dev/null -D - --max-time 20 "https://$h/en/pricing" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | head -1)"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$h/en/pricing")"
  if [ "$code" = 302 ] && echo "$loc" | grep -q "vercel.com/sso-api"; then res PASS "$h -> $code SSO redirect (protected)"; else res FAIL "$h -> $code (public)"; fi
done

if [ -z "$KEY" ]; then echo "== 2/3 skipped: set SUPABASE_PUBLISHABLE_KEY (public key) to check Supabase"; res UNKNOWN "Supabase checks need the public key"; else
echo "== 2. Supabase Auth: new sign-ups must be disabled"
ds="$(curl -s --max-time 20 -H "apikey: $KEY" "https://$REF.supabase.co/auth/v1/settings" | python3 -c "import sys,json;print(json.load(sys.stdin).get('disable_signup'))" 2>/dev/null)"
[ "$ds" = True ] && res PASS "disable_signup=true" || res FAIL "disable_signup=$ds (self-registration open)"
echo "== 3. Supabase Data API (PostgREST/RPC) exposure"
# Probe: a GET of one id column from a table that is EMPTY by the owner's inventory (analysis_cache). Enabled Data API + anon grant answers 200.
out="$(curl -s -w ' %{http_code}' --max-time 20 -H "apikey: $KEY" "https://$REF.supabase.co/rest/v1/analysis_cache?select=id&limit=1")"
code="${out##* }"
if [ "$code" = 200 ]; then res FAIL "anon can query the Data API (analysis_cache -> 200): PostgREST/RPC reachable with the public key"; else res PASS "Data API answers $code to the public key (disabled or closed)"; fi
fi
echo "== 4. Polar checkout links: cannot be verified from outside without creating a checkout session"
res UNKNOWN "owner confirmation in the Polar dashboard required (archived/deactivated Plus and Pro links)"
echo "== 5. GitHub secret scanning"
ss="$(gh api repos/ErenTahiroglu/ClinicalPSM --jq '[.security_and_analysis.secret_scanning.status,.security_and_analysis.secret_scanning_push_protection.status]|join("/")' 2>/dev/null)"
[ "$ss" = "enabled/enabled" ] && res PASS "secret scanning + push protection enabled" || res FAIL "secret scanning/push protection: ${ss:-unknown}"
exit $rc
