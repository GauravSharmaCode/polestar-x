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

# --- to-windows-path helper (npm on Git Bash / WSL wants a native path) -----
winpath() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$1" | tr '\\' '/'
  else
    printf '%s\n' "$1"
  fi
}

# --- detect package dir (mirrors logic in smoke.sh) -------------------------
# Node-free, flat-default detection — see smoke.sh detect_pkg_dir for why.
PKG_DIR="${1:-}"
if [ -z "$PKG_DIR" ]; then
  if grep -q '"@gauravsharmacode/polestar-x"' "$REPO_ROOT/package.json" 2>/dev/null; then
    PKG_DIR="$REPO_ROOT"
  elif [ -f "$REPO_ROOT/packages/polestar/package.json" ]; then
    PKG_DIR="$REPO_ROOT/packages/polestar"
  else
    PKG_DIR="$REPO_ROOT"
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
