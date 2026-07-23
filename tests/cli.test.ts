import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const exec = promisify(execFile);
const roots: string[] = [];
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.js");

after(async () => {
  await Promise.all(
    roots.map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

test("initializes an isolated home and synchronizes local and remote changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-cli-"));
  roots.push(root);
  const home = join(root, "home");
  const bin = join(root, "bin");
  const remote = join(root, "remote.git");
  const other = join(root, "other");
  const codexLog = join(root, "codex.log");
  const pluginsJson = join(root, "plugins.json");
  const marketplacesJson = join(root, "marketplaces.json");
  await mkdir(bin, { recursive: true });
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(
    join(home, ".codex", "config.toml"),
    `model = "gpt-5"
api_key = "local-secret"

[mcp_servers.private]
url = "https://example.com"
http_headers = { Authorization = "secret" }
`,
  );
  await writeFile(pluginsJson, '{"installed":[],"available":[]}\n');
  await writeFile(marketplacesJson, '{"marketplaces":[]}\n');
  await writeFile(codexLog, "");

  const fakeCodex = join(bin, "codex");
  await writeFile(
    fakeCodex,
    `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CODEXKEEP_TEST_CODEX_LOG"
case "$*" in
  "plugin list --json") cat "$CODEXKEEP_TEST_PLUGINS" ;;
  "plugin marketplace list --json") cat "$CODEXKEEP_TEST_MARKETPLACES" ;;
  "plugin marketplace add --json -- "*) exit 0 ;;
  "plugin add --json -- "*) exit 0 ;;
  "plugin marketplace upgrade") exit 0 ;;
  *) exit 1 ;;
esac
`,
  );
  await chmod(fakeCodex, 0o755);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    CODEX_CLI_PATH: fakeCodex,
    CODEXKEEP_TEST_CODEX_LOG: codexLog,
    CODEXKEEP_TEST_PLUGINS: pluginsJson,
    CODEXKEEP_TEST_MARKETPLACES: marketplacesJson,
    XDG_STATE_HOME: join(home, ".local", "state"),
    GIT_CONFIG_GLOBAL: join(root, "global-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "CodexKeep Test",
    GIT_AUTHOR_EMAIL: "codexkeep@example.invalid",
    GIT_COMMITTER_NAME: "CodexKeep Test",
    GIT_COMMITTER_EMAIL: "codexkeep@example.invalid",
    PATH: `${bin}:/usr/bin:/bin`,
  };

  const initialized = await exec(process.execPath, [cli, "init", "--yes"], {
    env,
  });
  assert.match(initialized.stdout, /初始化完成/u);
  assert.equal(
    await readlink(join(home, ".agents", "skills")),
    join(home, ".codexkeep", "skills"),
  );
  const initializedBaseConfig = await readFile(
    join(home, ".codex", "config.toml"),
    "utf8",
  );
  assert.match(initializedBaseConfig, /model = "gpt-5"/u);
  assert.match(initializedBaseConfig, /local-secret/u);
  assert.doesNotMatch(initializedBaseConfig, /^profile\s*=/mu);
  assert.match(
    await readFile(
      join(home, ".codexkeep", "codex", "codexkeep.config.toml"),
      "utf8",
    ),
    /model = "gpt-5"/u,
  );

  const checked = await exec(process.execPath, [cli, "check"], { env });
  assert.match(checked.stdout, /当前设备状态正常/u);

  await git(["init", "--bare", remote], root, env);
  await git(["remote", "add", "origin", remote], join(home, ".codexkeep"), env);
  const firstPublish = await exec(
    process.execPath,
    [cli, "sync", "--yes"],
    { env },
  );
  assert.match(firstPublish.stdout, /首次发布私人配置仓库/u);
  await git(["--git-dir", remote, "rev-parse", "refs/heads/main"], root, env);
  await git(["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"], root, env);

  await writeFile(
    join(home, ".codexkeep", "skills", "local.md"),
    "# Local skill\n",
  );
  const synced = await exec(
    process.execPath,
    [cli, "sync", "--yes"],
    { env },
  );
  assert.match(synced.stdout, /同步完成/u);

  await git(["clone", remote, other], root, env);
  await git(["config", "user.name", "Other Test"], other, env);
  await git(["config", "user.email", "other@example.invalid"], other, env);
  await writeFile(
    join(other, "plugins.json"),
    `${JSON.stringify(
      {
        version: 1,
        marketplaces: [
          {
            name: "custom",
            source: "https://example.com/custom.git",
          },
        ],
        plugins: ["demo@custom"],
        accountPlugins: [],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(other, "codex", "codexkeep.config.toml"),
    'model = "gpt-5.5"\n',
  );
  await git(
    ["add", "plugins.json", "codex/codexkeep.config.toml"],
    other,
    env,
  );
  await git(["commit", "-m", "test: add plugin"], other, env);
  await git(["push"], other, env);

  const received = await exec(
    process.execPath,
    [cli, "sync", "--yes"],
    { env },
  );
  assert.match(received.stdout, /plugin demo@custom 已安装/u);
  const codexCalls = await readFile(codexLog, "utf8");
  assert.match(
    codexCalls,
    /plugin marketplace add --json -- https:\/\/example\.com\/custom\.git/u,
  );
  assert.match(codexCalls, /plugin add --json -- demo@custom/u);
  const updatedBaseConfig = await readFile(
    join(home, ".codex", "config.toml"),
    "utf8",
  );
  assert.match(updatedBaseConfig, /model = "gpt-5.5"/u);
  assert.match(updatedBaseConfig, /local-secret/u);
});

async function git(
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await exec("git", [...args], { cwd, env });
}
