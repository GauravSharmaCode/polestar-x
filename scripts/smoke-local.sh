#!/usr/bin/env bash
#
# One-shot manual smoke run: installs deps, builds, then delegates to smoke.sh.
# Use this for ad-hoc validation. The release pipeline (scripts/release.mjs)
# calls smoke.sh directly (after its own npm ci + build steps).
#
# Usage:
#   scripts/smoke-local.sh [PKG_DIR]
#
# All SMOKE_* env vars are forwarded to smoke.sh.
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ FAIL:\033[0m %s\n' "$*" >&2; exit 1; }

# --- detect package dir (mirrors logic in smoke.sh) -------------------------
PKG_DIR="${1:-}"
if [ -z "$PKG_DIR" ]; then
  root_name="$(node -p "require('$REPO_ROOT/package.json').name" 2>/dev/null || echo "")"
  if [ "$root_name" = "@gauravsharmacode/polestar-x" ]; then
    PKG_DIR="$REPO_ROOT"
  else
    PKG_DIR="$REPO_ROOT/packages/polestar"
  fi
fi

[ -f "$PKG_DIR/package.json" ] || die "no package.json at $PKG_DIR"
bold "smoke-local: package at $PKG_DIR"

# --- install deps -----------------------------------------------------------
bold "npm ci --ignore-scripts…"
( cd "$PKG_DIR" && npm ci --ignore-scripts )
ok "deps installed"

# --- build ------------------------------------------------------------------
bold "npm run build…"
( cd "$PKG_DIR" && npm run build )
[ -f "$PKG_DIR/dist/cli.js" ] || die "build did not produce dist/cli.js"
ok "build complete"

# --- delegate to smoke.sh ---------------------------------------------------
exec "$SCRIPT_DIR/smoke.sh" "$PKG_DIR"
