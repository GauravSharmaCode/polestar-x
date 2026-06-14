#!/usr/bin/env bash
#
# PoleStar-X install smoke test — the gate 0.1.0 was missing.
#
# Packs the *publishable* package, installs it globally from the tarball, and
# verifies the real artifact: the CLI boots, every runtime dependency resolves,
# a live provider answers, and `/init-config` scaffolds the config dir. Run it
# against a local pack (pre-publish) and again against the registry tarball
# (post-publish) — see Phase 5 of docs/plan/0.2.0-standalone-restructure.md.
#
# Usage:
#   scripts/smoke.sh [PKG_DIR]
#
#   PKG_DIR defaults to the publishable package:
#     - repo root            if root package.json IS the polestar package (post-restructure)
#     - packages/polestar    otherwise (pre-restructure monorepo layout)
#
#   Pre-flight: node_modules must be installed and dist/ must be built before
#   running. From the release pipeline this is guaranteed (npm ci + npm run build
#   run first). For a standalone manual run use scripts/smoke-local.sh instead —
#   it handles npm ci + build then delegates here.
#
# Env toggles:
#   SMOKE_MODELS="a/b c/d"      space-separated provider/model ids for the live gate
#                               (default: "github-copilot/gpt-4o-mini opencode/grok-code")
#   SMOKE_ALLOW_PROVIDER_SKIP=1 don't fail if every live-provider gate errors
#                               (--help/--version/--list-models still gate hard)
#   SMOKE_SKIP_INTERACTIVE=1    skip the tmux interactive gate explicitly
#   SMOKE_KEEP=1                keep temp dirs + installed global for debugging
#
set -euo pipefail

# --- pretty output ----------------------------------------------------------
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ SMOKE FAIL:\033[0m %s\n' "$*" >&2; exit 1; }

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

# --- shell guard: this script targets Git Bash on Windows -------------------
# `bash` on a Windows PATH frequently resolves to the WSL launcher
# (C:\Windows\System32\bash.exe). Under WSL the Windows paths this script builds
# (cygpath / .cmd shims / `node -p require('C:/...')`) break, and the failure
# used to surface as a confusing "no package.json at .../packages/polestar".
# Fail fast with a precise instruction instead. The release pipeline already
# selects Git Bash automatically (scripts/release.mjs → bashExe()).
if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
  die "running under WSL — this script targets Git Bash. Re-run it under Git Bash, e.g.
  '/c/Program Files/Git/bin/bash.exe' scripts/smoke.sh
  (the release pipeline picks Git Bash automatically)."
fi

# --- resolve repo + package dir ---------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel)"

detect_pkg_dir() {
  if [ "${1:-}" != "" ]; then
    printf '%s\n' "$1"; return
  fi
  # The repo is a single flat package at the root (the packages/polestar
  # monorepo layout was removed in 0.2.0). Read the name straight from
  # package.json with grep — no `node -p require(...)`, which fails silently
  # under a non-Windows node and used to mask the real error.
  if grep -q '"@gauravsharmacode/polestar-x"' "$REPO_ROOT/package.json" 2>/dev/null; then
    printf '%s\n' "$REPO_ROOT"            # flat repo (current layout)
  elif [ -f "$REPO_ROOT/packages/polestar/package.json" ]; then
    printf '%s\n' "$REPO_ROOT/packages/polestar"   # legacy monorepo, if ever resurrected
  else
    printf '%s\n' "$REPO_ROOT"            # default: flat repo
  fi
}

PKG_DIR="$(detect_pkg_dir "${1:-}")"
[ -f "$PKG_DIR/package.json" ] || die "no package.json at $PKG_DIR"

PKG_NAME="$(node -p "require('$(winpath "$PKG_DIR/package.json")').name")"
PKG_VERSION="$(node -p "require('$(winpath "$PKG_DIR/package.json")').version")"
BIN_NAME="$(node -p "Object.keys(require('$(winpath "$PKG_DIR/package.json")').bin || {})[0] || ''")"
[ -n "$BIN_NAME" ] || die "package $PKG_NAME declares no bin"

bold "PoleStar-X smoke: $PKG_NAME@$PKG_VERSION  (bin: $BIN_NAME)"
echo "  package dir: $PKG_DIR"

# --- pre-flight: dist must already be built ---------------------------------
if [ ! -f "$PKG_DIR/dist/cli.js" ]; then
  die "dist/cli.js not found at $PKG_DIR/dist/cli.js
  Run \`npm ci --ignore-scripts && npm run build\` (from $PKG_DIR) first,
  or use scripts/smoke-local.sh which handles that automatically."
fi

bold "Packing tarball…"
TARBALL="$( cd "$PKG_DIR" && npm pack --silent | tail -1 )"
TARBALL_ABS="$PKG_DIR/$TARBALL"
[ -f "$TARBALL_ABS" ] || die "npm pack did not produce $TARBALL_ABS"
ok "packed $TARBALL"

# --- temp workspace + global install ----------------------------------------
SMOKE_DIR="$(mktemp -d)"
INSTALLED_GLOBAL=0

cleanup() {
  if [ "${SMOKE_KEEP:-}" = "1" ]; then
    warn "SMOKE_KEEP=1 — leaving $SMOKE_DIR and global install in place"
    return
  fi
  if [ "$INSTALLED_GLOBAL" = "1" ]; then
    npm uninstall -g "$PKG_NAME" >/dev/null 2>&1 || true
  fi
  rm -rf "$SMOKE_DIR" || true
  rm -f "$TARBALL_ABS" || true
}
trap cleanup EXIT

bold "Installing globally from tarball…"
npm install -g --ignore-scripts "$(winpath "$TARBALL_ABS")"
INSTALLED_GLOBAL=1

# make sure the freshly-installed bin is on PATH
NPM_GLOBAL_PREFIX="$(npm prefix -g)"
# On Windows/Git Bash, npm prefix -g returns a Windows path (e.g. C:\Users\...).
# Convert it to a POSIX path so Bash can put it on PATH correctly.
NPM_GLOBAL_UNIX="$(cygpath -u "$NPM_GLOBAL_PREFIX" 2>/dev/null || printf '%s\n' "$NPM_GLOBAL_PREFIX")"
export PATH="$NPM_GLOBAL_UNIX:$NPM_GLOBAL_UNIX/bin:$PATH"

# On Windows, npm creates a .cmd shim alongside the shell script.
# The shell script shim uses POSIX paths that Node can't resolve on Windows,
# so we must invoke the .cmd wrapper instead.
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "$WINDIR" ]]; then
  BIN_CMD="${BIN_NAME}.cmd"
else
  BIN_CMD="${BIN_NAME}"
fi

command -v "$BIN_CMD" >/dev/null 2>&1 || die "$BIN_CMD not on PATH after global install"
ok "installed; $BIN_CMD resolves to $(command -v "$BIN_CMD")"

# ----------------------------------------------------------------------------
# Gate 1 — process boots and every runtime dependency resolves
# ----------------------------------------------------------------------------
bold "Gate 1: boot + dependency resolution"
"$BIN_CMD" --help        >/dev/null || die "--help failed (boot or missing dep)"
# Sovereignty assertion: a sovereign install reports polestar's version
# (PI_PACKAGE_DIR → polestar package.json), not pi's. If this prints pi's
# version, the redirect/asset vendoring is broken and the changelog/config-dir
# would be pi's too.
ver_out="$("$BIN_CMD" --version 2>/dev/null | tr -d '[:space:]')"
if [ "$ver_out" = "$PKG_VERSION" ]; then
  ok "--version reports $ver_out (sovereign identity active)"
else
  die "--version reported '$ver_out', expected '$PKG_VERSION' — sovereign identity NOT active (PI_PACKAGE_DIR redirect or asset vendoring broken)"
fi
"$BIN_CMD" --list-models >/dev/null || die "--list-models failed (provider catalog)"
ok "boots, --list-models clean"

# ----------------------------------------------------------------------------
# Gate 2 — a live provider actually answers (graceful fallback)
# ----------------------------------------------------------------------------
bold "Gate 2: live provider round-trip"
MODELS="${SMOKE_MODELS:-github-copilot/gpt-4o-mini opencode/grok-code}"
provider_successes=0
for model in $MODELS; do
  if "$BIN_CMD" --model "$model" -p "Say exactly: ok" 2>/dev/null | grep -qi 'ok'; then
    ok "$model answered"
    provider_successes=$((provider_successes + 1))
  else
    warn "$model did not answer (auth/rate-limit/endpoint?) — continuing"
  fi
done
if [ "$provider_successes" -eq 0 ]; then
  if [ "${SMOKE_ALLOW_PROVIDER_SKIP:-}" = "1" ]; then
    warn "no provider answered, but SMOKE_ALLOW_PROVIDER_SKIP=1 — not failing"
  else
    die "no live provider answered (set SMOKE_ALLOW_PROVIDER_SKIP=1 to tolerate)"
  fi
fi

# ----------------------------------------------------------------------------
# Gate 3 — interactive mode boots (needs tmux; auto-skips when absent)
# ----------------------------------------------------------------------------
bold "Gate 3: interactive boot"
if [ "${SMOKE_SKIP_INTERACTIVE:-}" = "1" ]; then
  warn "SMOKE_SKIP_INTERACTIVE=1 — skipping"
elif ! command -v tmux >/dev/null 2>&1; then
  warn "tmux not found (expected on Windows) — skipping interactive gate"
  warn "  run this gate on a tmux-capable host, or add a PowerShell-pty mirror"
else
  imodel="${MODELS%% *}"   # first model
  tmux new-session -d -s polestar-smoke -x 120 -y 40 "$BIN_CMD --model $imodel"
  sleep 3
  tmux send-keys -t polestar-smoke "Say exactly: ok" Enter
  sleep 15
  if tmux capture-pane -t polestar-smoke -p | grep -qi 'ok'; then
    ok "interactive session answered"
  else
    tmux kill-session -t polestar-smoke 2>/dev/null || true
    die "interactive session did not answer"
  fi
  tmux send-keys -t polestar-smoke "/quit" Enter 2>/dev/null || true
  sleep 1
  tmux kill-session -t polestar-smoke 2>/dev/null || true
fi

# ----------------------------------------------------------------------------
# Gate 4 — PoleStar-specific feature: /init-config scaffolds the config dir
#
# Pi's headless -p mode may not dispatch slash commands. We try two forms:
#   1. -p "/init-config"   (slash-command syntax)
#   2. -p "init-config"    (plain positional — some CLIs route both ways)
# If neither produces the scaffold, the gate fails with a precise diagnostic.
# ----------------------------------------------------------------------------
bold "Gate 4: --init-config scaffolding"

PROJ_DIR1="$SMOKE_DIR/proj-init"
mkdir -p "$PROJ_DIR1"
( cd "$PROJ_DIR1" && "$BIN_CMD" --init-config >/dev/null 2>&1 )

if [ -f "$PROJ_DIR1/.polestar/settings.json" ] && [ -f "$PROJ_DIR1/.polestar/mcp.json" ]; then
  ok ".polestar/{settings.json,mcp.json} scaffolded via --init-config"
else
    echo "=== proj-init .polestar contents (if any) ===" >&2
    ls -la "$PROJ_DIR1/.polestar" 2>/dev/null || true >&2
    die "--init-config did not scaffold .polestar/ — check cli.ts intercept"
fi

bold "SMOKE PASS"
