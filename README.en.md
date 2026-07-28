<p align="center">
  <a href="https://github.com/HenryOoO/codexkeep/blob/main/README.md">简体中文</a>
  ·
  <strong>English</strong>
</p>

<p align="center">
  <img
    src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/codexkeep-banner.en.svg"
    alt="CodexKeep synchronizes a deliberately selected set of Codex configuration across Macs while sensitive, machine-specific content stays local."
    width="100%"
  />
</p>

<p align="center">
  <a href="#start-in-30-seconds"><img src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/readme-start.svg" alt="Get started icon" width="16" height="16" /> <strong>Start in 30 seconds</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.en.md"><img src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/readme-safety.svg" alt="Safety and recovery icon" width="16" height="16" /> <strong>Safety &amp; recovery</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/HenryOoO/codexkeep/blob/main/docs/commands.en.md"><img src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/readme-commands.svg" alt="Command guide icon" width="16" height="16" /> <strong>Command guide</strong></a>
</p>

<h1 align="center">Sync your Codex configuration safely.</h1>

<p align="center">
  CodexKeep uses your own private Git repository to synchronize a deliberately
  selected set of Codex configuration across Macs; credentials, sessions, and
  machine-specific content always stay local.
</p>

<p align="center">
  <sub>Unofficial community project. Not affiliated with or endorsed by OpenAI.</sub>
</p>

## Start in 30 seconds

The first release requires macOS, Git, and Node.js 22 or newer. Create an empty
private repository on GitHub or another Git provider, then run:

```bash
npm install -g codexkeep
codexkeep init git@github.com:your-name/codexkeep-config.git
```

CodexKeep discovers supported configuration, shows the complete initialization
plan, and only then connects the local paths and publishes the first version.
To start without a remote, run `codexkeep init`.

### On another Mac

Install CodexKeep and initialize with the same repository:

```bash
codexkeep init git@github.com:your-name/codexkeep-config.git
```

Use `init`, not `link`, on a new device. CodexKeep clones and validates the
repository in a temporary directory before it changes any local path.

### Daily sync

```bash
codexkeep sync
```

The current CLI prints in Chinese. A typical sync shows only the proposed work
and its outcome:

```text
$ codexkeep sync
将进行以下同步：
  + 保存 1 项本地修改
  + 接收 1 个远程更新
  + 上传 1 个本地更新
✓ 本地配置已保存
✓ 远程仓库已更新
同步完成；所有设备可以使用同一份配置
```

Run `codexkeep update` when third-party skills and plugin marketplaces should
be upgraded first, or `codexkeep check` to diagnose the current device.
Running `codexkeep` opens the interactive menu, which currently uses Chinese.

## Sync boundaries

| Synchronized | Always local |
| --- | --- |
| Personal skills and source records | Authentication, tokens, connector credentials |
| Global `AGENTS.md` and custom agents | Sessions, history, logs, databases, caches |
| Allowlisted portable preferences | Project trust and machine-specific paths |
| Validated third-party plugin inventory | Built-in skills, plugin bundles, sign-in state |

Three boundaries remain even with `--yes`:

1. `init` and `sync` complete their preflight and plan before changing managed
   configuration.
2. You must choose how to resolve content conflicts; CodexKeep never guesses.
3. Credentials, sessions, caches, and machine-specific paths never enter the
   private repository.

For the complete field list, directory layout, and recovery behavior, read the
[Safety and recovery guide](https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.en.md).

## Commands

| Command | Purpose |
| --- | --- |
| `codexkeep` | Open the interactive menu |
| `codexkeep init [git-url]` | Initialize this Mac or join an existing repository |
| `codexkeep sync` | Reconcile local configuration and the Git remote |
| `codexkeep update` | Upgrade third-party sources, then synchronize |
| `codexkeep check` | Run read-only local diagnostics |
| `codexkeep remote [git-url]` | Inspect or connect the private Git remote |
| `codexkeep link` | Restore missing local configuration links |

`--yes` accepts routine confirmations only. It never bypasses validation or
resolves a content conflict. See the
[complete command guide](https://github.com/HenryOoO/codexkeep/blob/main/docs/commands.en.md)
for arguments, network access, file changes, and failure behavior.

## Frequently asked questions

### Why should cross-device sync use a private repository?

The repository excludes credentials and sessions, but it still contains your
personal skills, global `AGENTS.md`, custom agents, allowlisted preferences,
and plugin inventory. Local-only use needs no remote; cross-device sync should
use a private repository.

### Should a new device use `init` or `link`?

Use `codexkeep init <git-url>` on a new device. Use `codexkeep link` only when
`~/.codexkeep` already exists locally and its official-path symlinks need to be
restored.

### Can a failed sync or conflict lose configuration?

CodexKeep never force-overwrites conflicting content. Local changes can still
be saved while the remote is unavailable; a failed push keeps the local commit
so a later `codexkeep sync` can retry. See
[Safety and recovery](https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.en.md)
for more scenarios.

## Documentation

- [Complete command guide](https://github.com/HenryOoO/codexkeep/blob/main/docs/commands.en.md)
- [Safety and recovery](https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.en.md)
- [Implementation notes](https://github.com/HenryOoO/codexkeep/blob/main/docs/IMPLEMENTATION.md)

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

Tests use isolated temporary home directories and never read or mutate real
user configuration.

## License

[MIT](https://github.com/HenryOoO/codexkeep/blob/main/LICENSE)
