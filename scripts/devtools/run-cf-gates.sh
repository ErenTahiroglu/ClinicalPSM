#!/usr/bin/env bash
# Cloudflare gate drivers. Local servers only (wrangler dev --local); synthetic data; dummy secrets; no remote calls.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB="$ROOT/apps/web"; SITE="$ROOT/experiments/cf01-static-site"; AUTH="$ROOT/experiments/cf01-auth-poc"
pids=()
cleanup(){ for p in "${pids[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done; pkill -f "wrangler dev --local" 2>/dev/null || true; }
trap cleanup EXIT
wait_http(){ for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; echo "server did not start: $1" >&2; return 1; }
install(){ (cd "$1" && { [ -d node_modules ] || npm ci --silent --no-audit --no-fund; }); }

case "${1:?mode}" in
  static-build)
    install "$SITE"; (cd "$SITE" && node build.mjs)
    n=$(find "$SITE/public" -type f | wc -l); echo "static files: $n"
    [ "$n" -gt 5 ] && [ "$n" -lt 20000 ] ;;
  site)
    install "$SITE"; (cd "$SITE" && node build.mjs && npx wrangler dev --local --port 8793 >/tmp/cf-site.log 2>&1) &
    pids+=($!); wait_http http://localhost:8793/en/
    (cd "$SITE" && node test/site.mjs http://localhost:8793) ;;
  exposure)
    install "$AUTH"
    (cd "$AUTH" && node scripts/build-and-inspect.mjs)
    rm -rf "$AUTH/.wrangler/state-gate"
    (cd "$AUTH" && npx wrangler d1 execute DB --local -c wrangler.jsonc --persist-to .wrangler/state-gate --file migrations/0001_init.sql >/dev/null 2>&1)
    (cd "$AUTH" && npx wrangler dev --local -c wrangler.jsonc --port 8792 --persist-to .wrangler/state-gate \
       --var BETTER_AUTH_URL:http://localhost:8792 BETTER_AUTH_SECRET:gate-only-secret-0123456789abcdef0123456789abcdef WEBHOOK_SECRET:gate-only-webhook >/tmp/cf-prod.log 2>&1) &
    pids+=($!); wait_http http://localhost:8792/api/me
    (cd "$AUTH" && node test/exposure.mjs http://localhost:8792) ;;
  contract)
    install "$AUTH"; rm -rf "$AUTH/.wrangler/state"
    (cd "$AUTH" && npx wrangler dev --local -c wrangler.test.jsonc --port 8790 >/tmp/cf-test.log 2>&1) &
    pids+=($!); wait_http http://localhost:8790/api/me
    (cd "$AUTH" && node test/contract.mjs http://localhost:8790) ;;
  web-build)
    install "$WEB"; (cd "$WEB" && node build.mjs)
    n=$(find "$WEB/public" -type f | wc -l); echo "static files: $n"
    [ "$n" -gt 10 ] && [ "$n" -lt 20000 ] ;;
  web-site)
    install "$WEB"; (cd "$WEB" && node build.mjs && npx wrangler dev --local --port 8793 >/tmp/cs-web.log 2>&1) &
    pids+=($!); wait_http http://localhost:8793/en/
    (cd "$WEB" && node test/site.mjs http://localhost:8793) ;;
  web-prod)
    install "$WEB"; (cd "$WEB" && node test/production-build.mjs && node build.mjs) ;;
  *) echo "unknown mode" >&2; exit 64 ;;
esac
