#!/usr/bin/env bash
set -euo pipefail

cd /home/artodad/projects/estate-planning-engine/apps/web

fuser -k 3001/tcp 2>/dev/null || true
sleep 1

if grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  url=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
  if echo "$url" | grep -q 'ep-xxx\|user:pass@'; then
    echo "DATABASE_URL: PLACEHOLDER"
  elif echo "$url" | grep -q 'neon.tech'; then
    echo "DATABASE_URL: SET neon"
  else
    echo "DATABASE_URL: SET other"
  fi
else
  echo "DATABASE_URL: MISSING"
fi

ls -la prisma/migrations 2>&1 || echo "no migrations dir"

rm -rf .next 2>/dev/null || true
pnpm dev > /tmp/dashboard-dev.log 2>&1 &
DEV_PID=$!
echo "Dev PID: $DEV_PID"

for i in $(seq 1 20); do
  if curl -s -o /dev/null http://localhost:3001/ 2>/dev/null; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

echo "=== curl -sI /dashboard ==="
curl -sI http://localhost:3001/dashboard 2>&1 || true

echo "=== curl -sI / ==="
curl -sI http://localhost:3001/ 2>&1 || true

echo "=== curl -s /dashboard body head ==="
curl -s http://localhost:3001/dashboard 2>&1 | head -40

echo "=== dev log errors ==="
grep -i 'error\|failed' /tmp/dashboard-dev.log | tail -30 || true

echo "=== next-development.log ==="
tail -25 .next/dev/logs/next-development.log 2>&1 || true

kill "$DEV_PID" 2>/dev/null || true
