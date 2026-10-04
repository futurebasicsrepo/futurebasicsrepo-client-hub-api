#!/bin/bash
# Customer-journey suite: scripted customers who make mistakes on purpose. Runs three throwaway servers
# (assistant fixture · Shopify unreachable · model API failing) against a Postgres database, then drives
# 27 journeys through the API and, when Playwright is available, a phone-sized browser.
#   needs: Postgres reachable at DATABASE_URL, psql on PATH. Optional: Playwright (PLAYWRIGHT_PATH or on the module path).
#   run:   npm run journeys
set -u
cd "$(dirname "$0")/../.."
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/fbhub_tp}"
export JOURNEY_TMP="$(mktemp -d)"; T="$JOURNEY_TMP"; mkdir -p "$T/uploads"
[ -z "${PLAYWRIGHT_PATH:-}" ] && [ -d /opt/node22/lib/node_modules/playwright ] && export PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright
for port in 3123 3124 3125; do for p in $(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill -9 "$p"; done; done
COMMON=(DATABASE_URL="$DATABASE_URL" JWT_SECRET=smoke-secret UPLOAD_DIR="$T/uploads" FOLLOWUPS_DISABLED=true)
FIX=scripts/journeys/fixtures/ai-runner.json
# A: production-like (no dev bypass), fixture assistant, billing on, no Shopify, /start limit lifted so the mistakes are not throttled
env "${COMMON[@]}" PORT=3123 CLIENT_HUB_URL=http://127.0.0.1:3123 AI_FIXTURE="$FIX" AI_FIXTURE_DELAY_MS=300 TECH_PACK_BILLING=on START_RATE_LIMIT=1000 node src/server.js > "$T/server-j-a.log" 2>&1 & PA=$!
# B: Shopify configured but unreachable, default limits
env "${COMMON[@]}" PORT=3124 CLIENT_HUB_URL=http://127.0.0.1:3124 AI_FIXTURE="$FIX" AI_FIXTURE_DELAY_MS=300 TECH_PACK_BILLING=on SHOPIFY_STORE_DOMAIN=unreachable-test.invalid SHOPIFY_CLIENT_ID=x SHOPIFY_CLIENT_SECRET=y MEMBERSHIP_CHECKOUT_URL=https://example.com/membership node src/server.js > "$T/server-j-b.log" 2>&1 & PB=$!
# C: a real (invalid) model key and no fixture, so every assistant call fails the way an API outage or an empty balance does
env "${COMMON[@]}" PORT=3125 CLIENT_HUB_URL=http://127.0.0.1:3125 ANTHROPIC_API_KEY=sk-ant-journeys TECH_PACK_BILLING=off START_RATE_LIMIT=1000 node src/server.js > "$T/server-j-c.log" 2>&1 & PC=$!
for port in 3123 3124 3125; do for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$port/health" >/dev/null && break; sleep 0.5; done; done
RC=0
node scripts/journeys/api.mjs          || RC=1
if node -e "require(process.env.PLAYWRIGHT_PATH||'playwright')" 2>/dev/null; then node scripts/journeys/browser.mjs || RC=1; else echo "skipping the browser journeys (Playwright not found)"; fi
node scripts/journeys/shopify-down.mjs || RC=1
node scripts/journeys/model-down.mjs   || RC=1
kill -9 $PA $PB $PC 2>/dev/null; wait $PA $PB $PC 2>/dev/null
echo "journeys: $([ $RC = 0 ] && echo 'all clear' || echo 'PROBLEMS FOUND')"; exit $RC
