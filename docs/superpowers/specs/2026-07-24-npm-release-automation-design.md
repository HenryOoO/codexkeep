# npm Release Automation Design

## Goal

Publish CodexKeep as the unscoped public npm package `codexkeep` and make
future releases a single local interactive command:

```bash
pnpm release
```

The local command prepares and publishes a GitHub Release. A GitHub Actions
workflow then validates and publishes the matching npm package through npm
Trusted Publishing.

## Scope

This change will:

- rename the package from `@henryooo/codexkeep` to `codexkeep`;
- update the README installation command;
- use `bumpp` for interactive semantic-version selection and coordinated
  version replacement;
- keep the CLI's displayed version synchronized with `package.json`;
- add a local release orchestrator;
- add a GitHub Actions workflow triggered by a published GitHub Release;
- publish through npm Trusted Publishing with OIDC instead of a long-lived
  npm write token; and
- document the one-time first-publication bootstrap.

It will not add changelog generation, prerelease publishing, monorepo support,
or automatic release creation from ordinary pushes to `main`.

## Package Metadata

`package.json.name` becomes `codexkeep`, so users install the package with:

```bash
npm install -g codexkeep
```

The existing `bin.codexkeep` mapping remains unchanged. The package will
explicitly target the public npm registry and public access through
`publishConfig`, reducing the risk of publishing to an unintended registry.

The first release remains `0.1.0`. Later releases must use a new semantic
version because npm package versions are immutable.

## Local Release Command

`package.json` exposes only one release entry point:

```bash
pnpm release
```

The command runs a small Node.js script backed by `bumpp`. No separate
`release:patch`, `release:minor`, or `release:major` commands are added.
`bumpp` presents the interactive version choices and asks for confirmation.

Before any version or Git mutation, the release script verifies:

1. the current branch is `main`;
2. the worktree and index are clean;
3. a fresh fetch confirms that `origin/main` exists and the local branch is
   neither ahead nor behind it;
4. GitHub CLI is installed and authenticated;
5. the target package name is `codexkeep`; and
6. `pnpm check`, `pnpm test`, and `pnpm build` all pass.

After preflight succeeds, `bumpp`:

1. updates `package.json.version`;
2. replaces the matching hard-coded version in `src/cli.ts`;
3. runs a pre-commit validation hook that confirms both files contain the same
   new version;
4. creates a commit named `chore: release vX.Y.Z`;
5. creates the Git tag `vX.Y.Z`; and
6. pushes the commit and tag to `origin`.

When `bumpp` completes, the Node script reads the new version from
`package.json` and runs:

```bash
gh release create vX.Y.Z --verify-tag --generate-notes --title vX.Y.Z
```

The GitHub Release is published immediately. Publishing it triggers the npm
workflow.

If preflight fails, the script stops before changing versioned files. If the
GitHub Release command fails after the commit and tag were pushed, it reports
the exact recovery command. The pushed release commit and tag are preserved;
the user can safely retry GitHub Release creation without bumping again.

## Version Synchronization

`bumpp` is configured to update both:

- `package.json`; and
- `src/cli.ts`.

The current version string must be present in both files. Failure to find or
update the CLI version is treated as a release failure before commit and push.
The release workflow independently verifies that the GitHub Release tag equals
`v${package.json.version}`.

## GitHub Actions Publishing

`.github/workflows/publish.yml` runs only for the `release.published` event and
only for a non-prerelease GitHub Release.

The job:

1. checks out the exact release tag;
2. installs the repository's pinned pnpm version;
3. configures Node.js 24 and the public npm registry without dependency-cache
   reuse;
4. grants only `contents: read` and `id-token: write`;
5. installs dependencies with `pnpm install --frozen-lockfile`;
6. verifies that the release tag matches `package.json.version`;
7. runs `pnpm check`, `pnpm test`, and `pnpm build`;
8. runs `npm pack --dry-run` to inspect the publishable package;
9. checks whether the exact package version already exists; and
10. runs `npm publish` only when that version is absent.

The existence check makes reruns and the first-release bootstrap idempotent.
Registry outages are not treated as “already published”; `npm publish` remains
the authoritative operation and will fail visibly if the registry is
unavailable.

The workflow uses npm Trusted Publishing on a GitHub-hosted runner. No
`NPM_TOKEN` secret is stored. npm automatically attaches provenance when the
repository and package meet npm's public provenance requirements.

## First-Publication Bootstrap

npm cannot configure a trusted publisher for a package that does not yet
exist. Version `0.1.0` therefore uses this one-time sequence:

1. merge and push the release automation to `main`;
2. run the complete local checks and `npm pack --dry-run`;
3. publish `codexkeep@0.1.0` interactively with npm 2FA;
4. configure npm Trusted Publishing for:
   - GitHub owner: `HenryOoO`;
   - repository: `codexkeep`;
   - workflow filename: `publish.yml`;
   - allowed action: `npm publish`;
5. create the `v0.1.0` GitHub Release from the published commit.

The workflow triggered by step 5 validates the release and observes that
`codexkeep@0.1.0` already exists, so it exits successfully without publishing
again. Every later stable version uses only `pnpm release`.

## Testing

Implementation verification includes:

- unit tests for release-script parsing and preflight decisions where logic can
  be isolated from real Git and GitHub operations;
- a dry-run or injected-command test proving that no real commit, tag, push,
  GitHub Release, home directory, or npm publication occurs in tests;
- existing `pnpm check`, `pnpm test`, and `pnpm build`;
- `npm pack --dry-run` inspection of package name, version, executable, README,
  license, and compiled files; and
- static review of the workflow event, permissions, tag guard, prerelease
  guard, frozen install, and OIDC publishing step.

Tests must use temporary repositories and temporary home directories. They
must never read or mutate the real user home directory.

## Failure and Recovery

- Dirty worktree, wrong branch, missing remote, unsynchronized `main`, missing
  GitHub authentication, or failed checks: stop before the version bump.
- Failure while `bumpp` updates files but before push: leave recoverable local
  state and print the affected paths; never reset or discard user changes.
- Push succeeds but GitHub Release creation fails: keep the pushed tag and
  print the exact `gh release create` retry command.
- GitHub Release validation fails: do not attempt npm publication.
- The npm version already exists: report it and finish successfully.
- npm publication fails: leave the GitHub Release and tag intact so the
  workflow can be rerun after credentials, trust configuration, or registry
  availability is corrected.

## Security

- Use npm Trusted Publishing with OIDC for automated releases.
- Grant the workflow only read access to repository contents and permission to
  request an OIDC identity token.
- Do not store npm write tokens in GitHub secrets.
- Use a GitHub-hosted runner, which npm requires for GitHub trusted publishing.
- Publish only from a GitHub Release tag whose version matches
  `package.json.version`.
- Keep prereleases out of the stable publishing workflow.
