#!/usr/bin/env bash
# Install Node.js 24 LTS and pnpm inside the chroot
set -euo pipefail

echo "[01-node] Installing Node.js 24 LTS"

# Use NodeSource binary distribution
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

node --version
npm --version

echo "[01-node] Installing pnpm"
npm install -g pnpm

pnpm --version
echo "[01-node] Node + pnpm ready"
