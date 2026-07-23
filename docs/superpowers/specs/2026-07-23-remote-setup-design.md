# CodexKeep remote setup and compatibility removal

## English summary

CodexKeep must own remote configuration instead of requiring raw Git commands.
`init [git-url]` handles first-time setup against either an empty remote or an
existing valid CodexKeep configuration repository. `remote [git-url]` shows or
connects the remote after local initialization and automatically enters the
existing sync flow. The product contains no MyCodex-specific migration path,
environment variable, legacy text inventory parser, or compatibility test.
Existing data is discovered only through documented Codex and agents paths.

## Scope

This revision has two goals:

1. A first-time user can connect an empty or populated private Git repository
   without typing `git remote add`, `git push`, or compensating commands.
2. CodexKeep has no knowledge of MyCodex. The current machine's one-time
   transition is not a permanent product feature.

CodexKeep does not create a GitHub repository through an API. The user creates
the private repository in the provider UI and gives CodexKeep its Git URL.

## Approaches considered

### Recommended: `init` plus `remote`

- `init [git-url]` owns first-time local setup.
- `remote [git-url]` shows the current remote or connects an already initialized
  local repository.
- Both call the existing sync application flow after one confirmation.

This keeps first-time and later remote setup discoverable without duplicating
Git reconciliation.

### Rejected: overload only `init`

Using `init` for an already initialized repository makes the command ambiguous:
it would need to mean both “create local state” and “change an existing remote.”
It also leaves no obvious command for inspecting the current remote.

### Rejected: document raw Git commands

Requiring `git remote add`, initial push, upstream setup, and recovery recreates
the exact multi-step CLI burden CodexKeep exists to remove.

## Public command behavior

```text
codexkeep init [git-url]
codexkeep remote [git-url]
codexkeep sync
```

`codexkeep remote` without an argument is read-only. It reports the configured
`origin`, or explains that the repository is local-only.

`codexkeep remote <git-url>`:

1. validates the local CodexKeep repository and Git state;
2. checks the URL without changing local configuration;
3. accepts an empty remote;
4. treats the same configured URL as an idempotent success;
5. requires one confirmation before adding or replacing `origin`;
6. calls the existing sync flow with confirmation already satisfied;
7. leaves `origin` configured when upload is temporarily unavailable, so a
   later `codexkeep sync` can retry without re-entering the URL.

The first release only connects an initialized local repository to an empty
remote. It refuses a populated different remote because safely combining
unrelated Git histories has materially different outcomes. A populated valid
CodexKeep repository belongs in the first-time `init <git-url>` flow.

There is no `remote --remove`, provider API integration, repository creation,
remote list, or multi-remote support in the first release.

## `init` flow

### Interactive, no URL

Before building the final plan, `codexkeep init` asks whether to remain
local-only or connect a private remote. If the user chooses a remote, it asks
for one Git URL. Non-interactive `init --yes` without a URL remains local-only;
automation must pass the URL explicitly.

### Empty remote

1. Run a read-only remote probe in the temporary initialization area.
2. Create the standard CodexKeep repository structure.
3. Initialize branch `main` and configure `origin` inside the temporary repo.
4. Discover current data only from supported official paths.
5. Show one final initialization plan, including first publication.
6. On confirmation, commit, install the local repository, apply links, and call
   the existing sync flow without another confirmation.

### Populated remote

1. Clone into a temporary directory.
2. Validate the CodexKeep schema before touching official paths.
3. Compare the remote contents with data exposed through official local paths.
4. Deduplicate identical content, add unique names, and ask only for genuine
   same-name content conflicts.
5. Show one final initialization plan.
6. On confirmation, commit selected local additions, install the repository,
   apply links, and call the existing sync flow without another confirmation.

A reachable but non-empty repository with no valid CodexKeep structure is
rejected with zero local changes. An unreachable or unauthorized repository is
reported as a connection problem, not as an invalid CodexKeep repository.

## No compatibility layer

Delete all product references and behavior specific to MyCodex:

- `legacyRepo` and `MYCODEX_HOME`;
- direct reads from `~/.mycodex`;
- `plugins.txt` parsing and conversion;
- MyCodex wording in README, implementation docs, tests, and errors;
- tests whose only purpose is validating legacy migration.

Generic discovery remains:

- `~/.agents/skills`;
- `~/.agents/.skill-lock.json`;
- `~/.codex/AGENTS.md`;
- `~/.codex/agents`;
- `~/.codex/config.toml`;
- current Codex marketplace, plugin, and account-plugin discovery.

If an official path is a symlink, CodexKeep reads the exposed content without
interpreting or recording where it came from. This supports normal existing
setups without a product-specific migration subsystem.

The current development machine's old repository is retained until the new
CodexKeep configuration has been initialized, uploaded, checked, and used
successfully. Removing the old local and GitHub repositories is an explicit
one-time operation outside CodexKeep.

## Architecture

The smallest implementation reuses existing boundaries:

- `services/git.ts` adds remote probing, origin read/add/set, and empty-remote
  classification;
- `commands/init.ts` selects the optional remote and handles empty versus
  populated initialization;
- `commands/remote.ts` performs later remote connection;
- `commands/sync.ts` accepts an internal “confirmation already satisfied”
  option; all planning, plugin reconciliation, commit, pull, and push behavior
  remains in this one implementation;
- `ui/index.ts` adds one text prompt for the Git URL;
- `services/workspace.ts`, `services/paths.ts`, and inventory tests delete
  legacy branches instead of replacing them with abstractions.

No new runtime dependency is needed.

## Safety and errors

- Remote probing uses argument arrays, never a shell command.
- URLs beginning with options or containing control characters are rejected.
- No remote or local filesystem mutation occurs before the final confirmation.
- A populated invalid remote never replaces or attaches to local state.
- Changing an existing `origin` requires an explicit plan and confirmation.
- A failed first push keeps local commits and the configured origin; the result
  says that local data is safe and upload can be retried.
- Raw Git stderr, tokens, credential URLs, and internal refs stay out of primary
  UI copy.

## Tests

Add isolated tests for:

- empty remote passed to `init`;
- valid populated remote passed to `init`;
- invalid populated remote causing zero local changes;
- unreachable remote causing zero local changes;
- `remote` read-only status;
- `remote <url>` first publication to an empty bare repository;
- idempotent same remote;
- replacement with another empty remote after confirmation;
- refusal of a populated different remote;
- non-interactive `init --yes` remaining local-only without an explicit URL;
- absence of `mycodex`, `MYCODEX_HOME`, and `plugins.txt` in production source,
  public docs, and compatibility tests.

All tests continue to use isolated temporary homes, bare Git repositories,
fake Codex output, and isolated Git configuration.
