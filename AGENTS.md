# PoleStar-X Development Rules

## Code Quality

- No `any` unless absolutely necessary.
- Use only erasable TypeScript syntax (Node strip-only mode): no `enum`, `namespace`, parameter properties.
- All imports top-level only — no inline `await import()`.

## Commands

- After code changes: `npm run check` (build + import-deps validation).
- Run tests: `npm test` (vitest).
- Before publish: `node scripts/publish-polestar.mjs --dry-run`.

## Git

- Never commit without discussing first.
- Stage explicit paths only (`git add <path>`); never `git add -A` or `git add .`.
- Branch naming: `feat/*`, `fix/*`, `chore/*`.

## Dependencies

- All `@earendil-works/pi-*` deps pinned to exact versions (no `^`, no `~`).
- Every package imported in `src/` must be declared in `dependencies`.
- The `scripts/check-package-import-deps.mjs` gate enforces this at build time.
- To upgrade pi: run `node scripts/check-pi-upgrade.mjs <version>` (when available), verify, then commit.
