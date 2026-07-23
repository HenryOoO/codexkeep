# CodexKeep implementation plan

## Milestone 1: executable foundation

- Publishable Node.js 22 ESM package with the `codexkeep` binary.
- Small command router and Clack-based interactive menu.
- Shared paths, process execution, Git, Codex CLI, TOML, inventory, link, and output services.

## Milestone 2: safe local ownership

- Create or clone `~/.codexkeep` through a temporary directory.
- Import MyCodex or supported official paths without copying program history.
- Convert `plugins.txt` to validated `plugins.json`.
- Extract only portable configuration into the `codexkeep` profile.
- Reconcile that portable allowlist into the base Codex config because current
  Codex releases do not support a persistent default-profile selector.
- Preflight all official paths, confirm once, back up adopted content, and create symlinks with rollback.

## Milestone 3: explicit synchronization

- Discover third-party marketplaces, plugins, and account plugin names.
- Fetch and compare the configured Git remote only after `codexkeep sync`.
- Install missing marketplace and plugin entries, commit local changes, rebase, and push.
- Keep local commits when the remote is offline and preserve both sides when Git reports a conflict.

## Milestone 4: update and diagnostics

- Upgrade sourced global skills and Git marketplaces before running the shared sync flow.
- Provide a read-only `check` command with actionable status and opt-in technical evidence.
- Keep interactive spinners out of redirected or test output.

## Verification

- Unit tests for inventory migration and portable TOML filtering.
- Filesystem tests for complete link preflight, idempotency, and rollback.
- CLI smoke tests using an isolated HOME and fake Codex executable.
- Package smoke test against the packed npm tarball.
