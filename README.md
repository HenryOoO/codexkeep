# CodexKeep

CodexKeep is a small, unofficial CLI for synchronizing personal Codex skills,
global instructions, custom agents, portable preferences, and selected plugin
inventory through a private Git repository that you control.

It is not affiliated with or endorsed by OpenAI.

## Install

```bash
npm install -g @henryooo/codexkeep
```

Node.js 22 or newer, Git, and macOS are required for the first release.

## First device

Create an empty private Git repository with your Git provider, then run:

```bash
codexkeep init git@github.com:your-name/codexkeep-config.git
```

CodexKeep checks the remote, discovers content exposed through supported Codex
paths, shows one plan, initializes `~/.codexkeep`, links the official paths,
and publishes the first version.

You can also start locally:

```bash
codexkeep init
codexkeep remote git@github.com:your-name/codexkeep-config.git
```

Interactive `init` asks whether to connect a remote. Non-interactive
`codexkeep init --yes` remains local-only unless a Git URL is supplied.

## Another device

```bash
codexkeep init git@github.com:your-name/codexkeep-config.git
```

An existing remote is cloned and validated in a temporary directory before any
official Codex path changes. A reachable populated repository that is not a
valid CodexKeep repository is rejected without changing local configuration.

## Commands

| Command | Purpose |
| --- | --- |
| `codexkeep` | Open the interactive menu. |
| `codexkeep init [git-url]` | Create or connect the private configuration repository. |
| `codexkeep remote [git-url]` | Show, connect, or replace the private Git remote, then publish. |
| `codexkeep sync` | Reconcile local configuration and explicitly synchronize Git. |
| `codexkeep update` | Upgrade sourced skills and plugin marketplaces, then synchronize. |
| `codexkeep link` | Re-create safe official-path symlinks without network access. |
| `codexkeep check` | Read-only local diagnostics; never contacts the remote. |

`--yes` accepts routine confirmations for automation. It never chooses one side
of a content conflict or replaces an already selected Codex profile.

`codexkeep remote <git-url>` accepts only an empty repository. Use
`codexkeep init <git-url>` on a new device to join an existing populated
CodexKeep repository.

## Data model

Real content lives in the private repository:

```text
~/.codexkeep/
├── skills/
├── skill-lock.json
├── plugins.json
└── codex/
    ├── AGENTS.md
    ├── codexkeep.config.toml
    └── agents/
```

Official paths point to that content:

```text
~/.agents/skills                    → ~/.codexkeep/skills
~/.agents/.skill-lock.json          → ~/.codexkeep/skill-lock.json
~/.codex/AGENTS.md                  → ~/.codexkeep/codex/AGENTS.md
~/.codex/agents                     → ~/.codexkeep/codex/agents
~/.codex/codexkeep.config.toml      → ~/.codexkeep/codex/codexkeep.config.toml
```

CodexKeep does not take over `~/.codex/skills`; Codex built-ins stay where
Codex installed them.

Current Codex versions only load a named profile when `--profile codexkeep` is
passed; they do not support a persistent default-profile selector. To make the
synced preferences work in the Codex app, CLI, and IDE without a wrapper
command, CodexKeep safely applies the portable allowlist from
`codexkeep.config.toml` to the real `~/.codex/config.toml`. Machine-only
sections and credentials remain local, and every changed base config is backed
up under `~/.local/state/codexkeep`.

## Never synchronized

- authentication, tokens, connector credentials, or MCP headers;
- sessions, history, logs, SQLite databases, caches, or desktop state;
- project trust and machine-specific absolute paths;
- plugin bundles, marketplace snapshots, or Codex built-in skills;
- project-level instructions, skills, or configuration.

Machine backups and the most recent technical error live under
`~/.local/state/codexkeep` and are excluded from Git.

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

Tests use isolated temporary home directories and never touch the real user
configuration.
