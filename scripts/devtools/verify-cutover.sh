#!/usr/bin/env bash
# Read-only verification of the clinicalpsm.com Cloudflare cutover. Public DNS/HTTP/TLS GETs only: no login, no writes, no credentials.
#   usage: verify-cutover.sh [--pre | --post] | --selftest
#   --pre  (default): the legacy Vercel pointers still exist (dangling) and the zone is NOT yet serving clinicalpsm-web
#   --post: apex 301 -> www; www serves the static app with required headers, EN/TR pages, TLS valid
# PASS / FAIL / INFO per check. Exit 1 on any FAIL.
set -uo pipefail
APEX="${CUTOVER_APEX:-clinicalpsm.com}"; WWW="${CUTOVER_WWW:-www.clinicalpsm.com}"
rc=0; res(){ printf '%-6s %s\n' "$1" "$2"; [ "$1" = FAIL ] && rc=1; true; }
mode="${1:---pre}"

hdr(){ curl -s -o /dev/null -D - --max-time 20 "$1" | tr -d '\r'; }
code(){ curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }

if [ "$mode" = "--selftest" ]; then
  # no network: parser sanity only
  printf 'HTTP/2 301\r\nLocation: https://www.example.org/x\r\n' | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | grep -q '^https://www.example.org/x$' || { echo "selftest FAIL"; exit 1; }
  bash -n "$0" && echo "selftest OK" && exit 0; exit 1
fi

echo "== 1. DNS (public resolvers)"
for h in "$APEX" "$WWW"; do
  a="$(dig +short "$h" A | tr '\n' ' ')"; c="$(dig +short "$h" CNAME | tr '\n' ' ')"
  echo "INFO   $h A=[${a:-none}] CNAME=[${c:-none}]"
  if echo "$a $c" | grep -Eq 'vercel|^64\.29\.17\.|^216\.198\.79\.| 64\.29\.17\.| 216\.198\.79\.'; then
    [ "$mode" = "--post" ] && res FAIL "$h still points at Vercel (dangling-takeover risk)" || res INFO "$h points at Vercel (expected before cutover; remove at cutover step 2)"
  fi
done
echo "== 2. Apex redirect (path + query preserved, HTTPS, no open redirect, no loop)"
EXPECT="${EXPECT_REDIRECT_STATUS:-301}"
if [ "$mode" = "--post" ]; then
  chk(){ # $1=label $2=url $3=expected Location
    c="$(code "$2")"; loc="$(hdr "$2" | awk 'tolower($1)=="location:"{print $2}' | head -1)"
    if [ "$c" = "$EXPECT" ] && [ "$loc" = "$3" ]; then res PASS "$1 -> $c $loc"; else res FAIL "$1 -> $c [$loc] (want $EXPECT $3)"; fi; }
  chk "T1 https apex path+query" "https://$APEX/en/pricing/?a=1&b=two" "https://$WWW/en/pricing/?a=1&b=two"
  chk "T2 http apex path+query" "http://$APEX/en/?x=1" "https://$WWW/en/?x=1"
  for u in "https://$APEX//evil.example/" "https://$APEX/?next=https://evil.example" "http://$APEX/%2f%2fevil.example"; do
    loc="$(hdr "$u" | awk 'tolower($1)=="location:"{print $2}' | head -1)"
    echo "$loc" | grep -Eq "^https://$WWW(/|$)" && res PASS "T4 off-host probe stays on $WWW: ${loc:-none}" || { [ -z "$loc" ] && res INFO "T4 probe returned no redirect" || res FAIL "T4 redirect leaves $WWW: $loc"; }
  done
  hops="$(curl -s -o /dev/null -L --max-redirs 5 -w '%{num_redirects} %{http_code} %{url_effective}' --max-time 30 "http://$APEX/en/?x=1")"
  case "$hops" in *" 200 https://$WWW/en/?x=1") res PASS "T5 chain ends at 200 on https www: $hops";; *) res FAIL "T5 chain: $hops";; esac
else res INFO "skipped before cutover"; fi
echo "== 3. www serving, headers, TLS"
c="$(code "https://$WWW/en/")"
if [ "$mode" = "--post" ]; then
  [ "$c" = 200 ] && res PASS "https://$WWW/en/ -> 200" || res FAIL "https://$WWW/en/ -> $c"
  for p in /en/ /tr/ /en/demo/ /tr/privacy/ /en/limits/ /en/pricing/ /tr/pricing/ /tr/limits/ /tr/demo/ /en/privacy/; do [ "$(code "https://$WWW$p")" = 200 ] && res PASS "$p 200" || res FAIL "$p not 200"; done
  [ "$(code "https://$WWW/no-such-page")" = 404 ] && res PASS "unknown path -> 404" || res FAIL "unknown path not 404"
  h="$(hdr "https://$WWW/en/")"
  for want in "content-security-policy:" "x-content-type-options: nosniff" "x-frame-options: deny" "referrer-policy: no-referrer" "permissions-policy:"; do
    echo "$h" | grep -qi "^$want" && res PASS "header $want" || res FAIL "missing header $want"
  done
  echo "$h" | grep -qi "unsafe-" && res FAIL "CSP contains unsafe-*" || res PASS "CSP has no unsafe-*"
  echo "$h" | grep -qi '^set-cookie:' && res FAIL "response sets a cookie" || res PASS "no Set-Cookie"
  hc="$(code "http://$WWW/en/")"
  { [ "$hc" = 301 ] || [ "$hc" = 308 ]; } && res PASS "http -> https redirect" || res INFO "http redirect not observed (enable Always Use HTTPS)"
  curl -sI --max-time 20 "https://$WWW/" -o /dev/null && res PASS "TLS handshake valid (certificate verified by curl)" || res FAIL "TLS verification failed"
else
  [ "$c" = 200 ] && res INFO "www already serves 200 (cutover may be done: rerun with --post)" || res INFO "www -> $c (expected before cutover)"
fi
echo "== 4. Legacy backends must stay gone"
[ "$(code "https://vmfypftkayycndvgpfrj.supabase.co/auth/v1/health")" = 000 ] && res PASS "legacy Supabase host unreachable" || res INFO "legacy Supabase host answers: investigate"
exit $rc
