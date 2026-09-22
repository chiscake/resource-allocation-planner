#!/usr/bin/env bash
# Cloud Agent install phase for resource-allocation-planner.
# Idempotent, must terminate. Runs after the repo is checked out.
# - Installs JS dependencies (pnpm, from the committed lockfile).
# - Ensures a bootable .env.local (gitignored) so the SvelteKit SPA can build
#   the Supabase client and run guest mode even before the local stack is up.
#   start.sh later refreshes the real keys from `supabase status`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[install] pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

if [ ! -f .env.local ]; then
  echo "[install] writing placeholder .env.local (refreshed by start.sh)"
  cat > .env.local <<'EOF'
# Local dev env (gitignored). start.sh overwrites keys from `supabase status`.
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SEED_PASSWORD=password123
EOF
fi

echo "[install] done"
