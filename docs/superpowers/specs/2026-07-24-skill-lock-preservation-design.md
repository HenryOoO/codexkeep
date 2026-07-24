# Preserve local skill-lock metadata

## Goal

CodexKeep must preserve the complete supported `.agents/.skill-lock.json` when
initializing a new local configuration repository. The current implementation
copies `skills` but drops other top-level fields such as `dismissed` and
`lastSelectedAgents`.

## Design

- During local-first initialization, use the complete local lockfile as the
  output base and merge its `skills` into the repository skeleton.
- During initialization from a populated remote, keep the remote lockfile as
  the output base. Existing per-skill conflict choices remain unchanged.
- Do not add field-specific compatibility code, a migration command, new
  prompts, or dependencies.
- Add an integration assertion proving arbitrary top-level metadata survives a
  local-first initialization.

## One-time cleanup

After the code fix passes checks:

1. restore the dropped top-level fields from the retained old lockfile;
2. commit and synchronize the repaired CodexKeep configuration;
3. verify links, inventory, Git status, and remote tracking state;
4. move `~/.mycodex` and its symlink-only CodexKeep backup to the macOS Trash.

The desktop CodexKeep source repository remains because the global pnpm package
links to it.
