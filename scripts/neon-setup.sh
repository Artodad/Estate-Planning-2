#!/usr/bin/env bash
set -euo pipefail

# Neon project for Estate Planning Engine
NEON_ORG_ID="org-bitter-tooth-27057604"
NEON_PROJECT_ID="small-firefly-53665719"
NEON_CONSOLE_URL="https://console.neon.tech/app/projects/${NEON_PROJECT_ID}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"
ENV_FILE="${WEB_DIR}/.env"

echo "Neon setup — Estate Planning Engine"
echo "  Org:     ${NEON_ORG_ID}"
echo "  Project: ${NEON_PROJECT_ID}"
echo "  Console: ${NEON_CONSOLE_URL}"
echo ""

if ! npx --yes neonctl me >/dev/null 2>&1; then
  echo "Neon CLI is not authenticated."
  echo "Run this first (opens browser):"
  echo ""
  echo "  npx neonctl auth"
  echo ""
  exit 1
fi

echo "Fetching direct connection string (best for prisma migrate dev)..."
DATABASE_URL="$(
  npx --yes neonctl connection-string \
    --project-id "${NEON_PROJECT_ID}" \
    --org-id "${NEON_ORG_ID}"
)"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "Failed to fetch connection string."
  echo "Copy it manually from: ${NEON_CONSOLE_URL} → Connect"
  exit 1
fi

mkdir -p "$(dirname "${ENV_FILE}")"
touch "${ENV_FILE}"

if grep -q '^DATABASE_URL=' "${ENV_FILE}"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "${ENV_FILE}"
  else
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "${ENV_FILE}"
  fi
else
  printf '\n# === Database (Neon) ===\nDATABASE_URL="%s"\n' "${DATABASE_URL}" >> "${ENV_FILE}"
fi

echo "Updated DATABASE_URL in apps/web/.env"
echo ""
echo "Running Prisma migration..."
cd "${WEB_DIR}"
pnpm exec prisma migrate dev --name init

echo ""
echo "Done. Optional: browse data with"
echo "  cd apps/web && pnpm exec prisma studio"
