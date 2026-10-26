# Anti-slop provenance

Source repository: https://github.com/dmmulroy/anti-slop

Installed from the local `.agents/skills/install-anti-slop/assets/anti-slop/` bundle using its installer. The exact upstream commit is unknown; `skills-lock.json` records the skill source and computed hash, not a verified source commit.

Installed entry points: `tools/oxlint/anti-slop/index.ts` and optional `tools/oxlint/anti-slop/effect/index.ts`. Only the generic plugin is enabled; this project does not directly depend on Effect.

The copied source is unchanged. `SNAPSHOT.sha256` records SHA-256 hashes of every original bundled file. The retained local skill assets provide a recoverable pristine snapshot; verify those bytes against the manifest before using them as a future merge base. This provenance file and the manifest are local additions.

The nested `vendor/eslint-stylistic/LICENSE` and `vendor/eslint-stylistic/UPSTREAM.md` retain the vendored rule license and its separate source revision.

Configuration preserves the existing custom plugin and severities, enables the missing `anti-slop/require-readable-spacing` rule at error, and adds the standard agent-tooling ignores. Oxlint and @oxlint/plugins remain pinned to 1.89.0. Application findings are reported without source cleanup.

Verification: the registered plugin loads through `pnpm lint`; lint reports an existing unused `event` parameter at `server/api/index.ts:3:31`. `pnpm typecheck` reports six implicit-any diagnostics in the existing `tools/oxlint/custom/rules/type-imports-first.ts` (lines 21–23 and 55–56). The installed plugin produced no typecheck diagnostics. `pnpm exec oxfmt --check oxlint.config.ts` passes. Every copied file was compared byte-for-byte with the retained skill bundle.
