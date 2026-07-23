# CodexKeep development

- Use Node.js 22 or newer and pnpm.
- Keep the CLI focused on personal Codex configuration synchronization.
- Prefer Node standard library APIs; add dependencies only for terminal prompts or formats that should not be hand-written.
- Never read or mutate the real user home directory in tests.
- Never sync credentials, sessions, caches, project trust, machine paths, Codex built-ins, or plugin bundles.
- Every filesystem mutation must be preceded by a complete preflight and preserve recoverable state.
- Run `pnpm check`, `pnpm test`, and `pnpm build` before committing behavior changes.
