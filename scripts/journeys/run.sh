#!/bin/bash
# Customer-journey suite: scripted customers who make mistakes on purpose. Runs three throwaway servers
# (assistant fixture · Shopify unreachable · model API failing) against a Postgres database, then drives
# 45 journeys through the API and, when Playwright is available, a phone-sized browser.
#   needs: Postgres reachable at DATABASE_URL, psql on PATH. Optional: Playwright (PLAYWRIGHT_PATH or on the module path).
#   run:   npm run journeys            (payment gate on, the production setup)
#          JOURNEY_GATE=off npm run journeys   (gate switched off for everyone; the journeys that start from a locked pack are skipped)
set -u
cd "$(dirname "$0")/../.."
# By default every run gets its own empty database (created here, dropped at the end), so runs stay fast and independent:
# a database that keeps every room earlier runs made gets slower each time (the console draws a card per client).
# Set DATABASE_URL yourself to run against a database you manage.
THROWAWAY=""
# Fail loudly, once, if the database is not there: otherwise every journey reports its own confusing connection error.
if ! psql "${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}" -qAtc "select 1" >/dev/null 2>&1; then
  echo "journeys: cannot reach Postgres at ${DATABASE_URL:-postgres://postgres:postgres@localhost:5432} - start it (or set DATABASE_URL) and run again" >&2; exit 2
fi
if [ -z "${DATABASE_URL:-}" ]; then
  THROWAWAY="fbhub_journeys_$$"; ADMIN_URL="postgres://postgres:postgres@localhost:5432/postgres"
  psql "$ADMIN_URL" -qAtc "create database $THROWAWAY" >/dev/null 2>&1 && export DATABASE_URL="postgres://postgres:postgres@localhost:5432/$THROWAWAY" || { THROWAWAY=""; export DATABASE_URL="postgres://postgres:postgres@localhost:5432/fbhub_tp"; }
fi
export JOURNEY_TMP="$(mktemp -d)"; T="$JOURNEY_TMP"; mkdir -p "$T/uploads"
[ -z "${PLAYWRIGHT_PATH:-}" ] && [ -d /opt/node22/lib/node_modules/playwright ] && export PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright
psql "$DATABASE_URL" -qAtc "delete from app_settings where key='techPackBilling'" >/dev/null 2>&1 # start every run with the payment gate on automatic
for port in 3123 3124 3125; do for p in $(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill -9 "$p"; done; done
COMMON=(DATABASE_URL="$DATABASE_URL" JWT_SECRET=smoke-secret UPLOAD_DIR="$T/uploads" FOLLOWUPS_DISABLED=true)
FIX=scripts/journeys/fixtures/ai-runner.json
# A: production-like (no dev bypass), fixture assistant, billing on, no Shopify, /start limit lifted so the mistakes are not throttled.
#    Its connection pool is deliberately tiny (4): any request that holds a database connection while asking for a second one hangs here.
env "${COMMON[@]}" PG_POOL_MAX=4 PORT=3123 CLIENT_HUB_URL=http://127.0.0.1:3123 AI_FIXTURE="$FIX" AI_FIXTURE_DELAY_MS=300 TECH_PACK_BILLING=$([ "${JOURNEY_GATE:-on}" = off ] && echo off || echo on) START_RATE_LIMIT=1000 node src/server.js > "$T/server-j-a.log" 2>&1 & PA=$!
# the first server creates the tables; the other two start once it is up, so they never race to migrate an empty database
for i in $(seq 1 120); do curl -sf "http://127.0.0.1:3123/health" >/dev/null && break; sleep 0.5; done
# B: Shopify configured but unreachable, default limits
env "${COMMON[@]}" PORT=3124 CLIENT_HUB_URL=http://127.0.0.1:3124 AI_FIXTURE="$FIX" AI_FIXTURE_DELAY_MS=300 TECH_PACK_BILLING=on SHOPIFY_STORE_DOMAIN=unreachable-test.invalid SHOPIFY_CLIENT_ID=x SHOPIFY_CLIENT_SECRET=y MEMBERSHIP_CHECKOUT_URL=https://example.com/membership node src/server.js > "$T/server-j-b.log" 2>&1 & PB=$!
# C: a real (invalid) model key and no fixture, so every assistant call fails the way an API outage or an empty balance does
env "${COMMON[@]}" PORT=3125 CLIENT_HUB_URL=http://127.0.0.1:3125 ANTHROPIC_API_KEY=sk-ant-journeys TECH_PACK_BILLING=off START_RATE_LIMIT=1000 node src/server.js > "$T/server-j-c.log" 2>&1 & PC=$!
for port in 3124 3125; do for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$port/health" >/dev/null && break; sleep 0.5; done; done
RC=0
node scripts/journeys/api.mjs          || RC=1
if node -e "require(process.env.PLAYWRIGHT_PATH||'playwright')" 2>/dev/null; then node scripts/journeys/browser.mjs || RC=1; else echo "skipping the browser journeys (Playwright not found)"; fi
node scripts/journeys/shopify-down.mjs || RC=1
node scripts/journeys/model-down.mjs   || RC=1
kill -9 $PA $PB $PC 2>/dev/null; wait $PA $PB $PC 2>/dev/null
[ -n "$THROWAWAY" ] && psql "postgres://postgres:postgres@localhost:5432/postgres" -qAtc "drop database if exists $THROWAWAY with (force)" >/dev/null 2>&1
echo "journeys: $([ $RC = 0 ] && echo 'all clear' || echo 'PROBLEMS FOUND')"; exit $RC
