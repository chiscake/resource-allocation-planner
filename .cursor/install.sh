#!/usr/bin/env bash
# Cloud Agent install phase for resource-allocation-planner.
# Idempotent, must terminate. Runs after the repo is checked out.
#
# 1. Ensures the system tooling the Supabase local stack needs (Docker CE,
#    fuse-overlayfs, legacy iptables, Supabase CLI). These are baked into the
#    environment snapshot, so on the normal path every check below is a no-op;
#    they self-heal if this ever runs on the plain base image.
# 2. Installs JS dependencies (pnpm, from the committed lockfile).
# 3. Ensures a bootable, gitignored .env.local so the SvelteKit SPA can build
#    the Supabase client and run guest mode even before the stack is up;
#    start.sh later refreshes the real keys from `supabase status`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SUPABASE_CLI_VERSION="2.117.0"

echo "[install] ensuring system tooling for the Supabase local stack"
NEED_APT=()
command -v docker          >/dev/null 2>&1 || NEED_APT+=(docker.io)
command -v fuse-overlayfs  >/dev/null 2>&1 || NEED_APT+=(fuse-overlayfs)
command -v newuidmap       >/dev/null 2>&1 || NEED_APT+=(uidmap)
command -v iptables        >/dev/null 2>&1 || NEED_APT+=(iptables)
if [ "${#NEED_APT[@]}" -gt 0 ]; then
  echo "[install] apt-get install: ${NEED_APT[*]}"
  sudo apt-get update -qq || true
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
    "${NEED_APT[@]}" || true
  # fuse3's conffile prompt can leave packages half-configured non-interactively.
  sudo DEBIAN_FRONTEND=noninteractive dpkg --configure --force-confold -a || true
fi

# Docker's nftables backend silently drops inter-container traffic in the nested
# Cloud Agent VM; select the legacy backend so bridge networking works.
sudo update-alternatives --set iptables  /usr/sbin/iptables-legacy  >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true

if ! command -v supabase >/dev/null 2>&1; then
  echo "[install] installing Supabase CLI v${SUPABASE_CLI_VERSION}"
  tmp="$(mktemp -d)"
  if curl -fsSL -o "$tmp/supabase.tar.gz" \
      "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.tar.gz"; then
    tar -xzf "$tmp/supabase.tar.gz" -C "$tmp"
    sudo install -m 0755 "$tmp/supabase" /usr/local/bin/supabase
  else
    echo "[install] WARNING: could not download Supabase CLI (offline?); stack start will be skipped"
  fi
  rm -rf "$tmp"
fi

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
