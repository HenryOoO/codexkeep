import assert from "node:assert/strict";
import {
  access,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { AppContext } from "../src/app.js";
import { checkCommand } from "../src/commands/check.js";
import { linkCommand } from "../src/commands/link.js";
import { applyLinks, inspectLinks } from "../src/services/links.js";
import { createPaths, linkSpecs } from "../src/services/paths.js";
import { createWorkspaceSkeleton } from "../src/services/workspace.js";
import { Ui, type Choice } from "../src/ui/index.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(
    roots.map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

test("links the device and cleans identical legacy skills with one confirmation", async () => {
  const setup = await createSetup("codexkeep-link-clean-");
  await writeSkill(join(setup.paths.repo, "skills"), "demo", "same");
  await writeSkill(join(setup.paths.codexHome, "skills"), "demo", "same");
  await writeSkill(
    join(setup.paths.codexHome, "skills", ".system"),
    "builtin",
    "keep",
  );

  const ui = new TestUi({ interactive: true, confirmValue: true });
  const result = await linkCommand(context(setup, ui));

  assert.equal(result, 0);
  assert.equal(ui.confirmCount, 1);
  assert.ok(
    (await inspectLinks(linkSpecs(setup.paths))).every(
      (entry) => entry.state === "ready",
    ),
  );
  await assert.rejects(
    async () =>
      await access(join(setup.paths.codexHome, "skills", "demo")),
  );
  assert.equal(
    await skillText(
      join(setup.paths.codexHome, "skills", ".system"),
      "builtin",
    ),
    "keep",
  );
  assert.match(ui.output(), /已整理 1 个旧版 skill/u);
});

test("resolves different skills individually even when links are already ready", async () => {
  const setup = await createSetup("codexkeep-link-conflicts-");
  await writeSkill(join(setup.paths.repo, "skills"), "alpha", "repository-a");
  await writeSkill(join(setup.paths.repo, "skills"), "beta", "repository-b");
  await applyLinks(linkSpecs(setup.paths), setup.paths.state, false);
  await writeSkill(
    join(setup.paths.codexHome, "skills"),
    "alpha",
    "legacy-a",
  );
  await writeSkill(
    join(setup.paths.codexHome, "skills"),
    "beta",
    "legacy-b",
  );

  const ui = new TestUi({
    interactive: true,
    confirmValue: true,
    choices: ["individual", "repository", "legacy"],
  });
  const result = await linkCommand(context(setup, ui));

  assert.equal(result, 0);
  assert.equal(ui.confirmCount, 1);
  assert.equal(
    await skillText(join(setup.paths.repo, "skills"), "alpha"),
    "repository-a",
  );
  assert.equal(
    await skillText(join(setup.paths.repo, "skills"), "beta"),
    "legacy-b",
  );
  await assert.rejects(
    async () =>
      await access(join(setup.paths.codexHome, "skills", "alpha")),
  );
  await assert.rejects(
    async () =>
      await access(join(setup.paths.codexHome, "skills", "beta")),
  );
});

test("--yes refuses content conflicts without modifying either side", async () => {
  const setup = await createSetup("codexkeep-link-yes-conflict-");
  await writeSkill(join(setup.paths.repo, "skills"), "demo", "repository");
  await writeSkill(join(setup.paths.codexHome, "skills"), "demo", "legacy");

  const ui = new TestUi({
    interactive: false,
    assumeYes: true,
    confirmValue: true,
  });
  const result = await linkCommand(context(setup, ui, true));

  assert.equal(result, 1);
  assert.equal(ui.confirmCount, 0);
  assert.equal(
    await skillText(join(setup.paths.repo, "skills"), "demo"),
    "repository",
  );
  assert.equal(
    await skillText(join(setup.paths.codexHome, "skills"), "demo"),
    "legacy",
  );
  assert.match(ui.output(), /请不带 --yes 重新运行/u);
});

test("restores a migrated legacy skill when subsequent link preflight fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-link-rollback-"));
  roots.push(root);
  const home = join(root, "home");
  const repo = join(home, ".codexkeep");
  const agentsHome = join(repo, "skills", "blocker");
  await createWorkspaceSkeleton(repo);
  const paths = createPaths({
    HOME: home,
    CODEXKEEP_CONFIG_DIR: repo,
    CODEXKEEP_STATE_DIR: join(root, "state"),
    CODEXKEEP_AGENTS_HOME: agentsHome,
  });
  await mkdir(join(paths.codexHome, "skills"), { recursive: true });
  await writeFile(join(paths.codexHome, "skills", "blocker"), "legacy");
  const setup = { root, paths, env: { HOME: home } };
  const ui = new TestUi({ interactive: true, confirmValue: true });

  const result = await linkCommand(context(setup, ui));

  assert.equal(result, 1);
  assert.equal(
    await readFile(join(paths.codexHome, "skills", "blocker"), "utf8"),
    "legacy",
  );
  await assert.rejects(
    async () => await access(join(repo, "skills", "blocker")),
  );
  assert.match(ui.output(), /原内容已经恢复/u);
});

test("check remains read-only and points legacy skills to link", async () => {
  const setup = await createSetup("codexkeep-check-legacy-");
  await writeSkill(join(setup.paths.repo, "skills"), "demo", "same");
  await applyLinks(linkSpecs(setup.paths), setup.paths.state, false);
  await writeSkill(join(setup.paths.codexHome, "skills"), "demo", "same");
  const fakeCodex = join(setup.root, "codex");
  await writeFile(
    fakeCodex,
    `#!/bin/sh
case "$*" in
  "plugin list --json") printf '%s\\n' '{"installed":[]}' ;;
  "plugin marketplace list --json") printf '%s\\n' '{"marketplaces":[]}' ;;
  *) exit 1 ;;
esac
`,
  );
  await chmod(fakeCodex, 0o755);
  const ui = new TestUi({ interactive: false, confirmValue: false });
  const checkSetup = {
    ...setup,
    env: {
      ...setup.env,
      CODEX_CLI_PATH: fakeCodex,
      PATH: "/usr/bin:/bin",
    },
  };

  const result = await checkCommand(context(checkSetup, ui));

  assert.equal(result, 1);
  assert.match(
    ui.output(),
    /运行 codexkeep link 可安全合并并清理旧副本/u,
  );
  assert.equal(
    await skillText(join(setup.paths.codexHome, "skills"), "demo"),
    "same",
  );
});

interface Setup {
  readonly root: string;
  readonly paths: ReturnType<typeof createPaths>;
  readonly env: NodeJS.ProcessEnv;
}

class TestUi extends Ui {
  readonly messages: string[] = [];
  readonly choiceValues: string[];
  readonly confirmValue: boolean;
  confirmCount = 0;

  constructor(options: {
    readonly interactive: boolean;
    readonly confirmValue: boolean;
    readonly assumeYes?: boolean;
    readonly choices?: readonly string[];
  }) {
    super({
      interactive: options.interactive,
      assumeYes: options.assumeYes ?? false,
    });
    this.confirmValue = options.confirmValue;
    this.choiceValues = [...(options.choices ?? [])];
  }

  override title(name: string, subtitle?: string): void {
    this.messages.push(subtitle ? `${name} ${subtitle}` : name);
  }

  override line(message = ""): void {
    this.messages.push(message);
  }

  override error(message: string): void {
    this.messages.push(`× ${message}`);
  }

  override done(message: string): void {
    this.messages.push(message);
  }

  override cancelled(message = "已取消，没有修改任何内容。"): void {
    this.messages.push(message);
  }

  override async confirm(_message: string): Promise<boolean> {
    this.confirmCount += 1;
    return this.confirmValue;
  }

  override async choose<T extends string>(
    _message: string,
    _choices: readonly Choice<T>[],
    fallback: T,
  ): Promise<T> {
    return (this.choiceValues.shift() ?? fallback) as T;
  }

  output(): string {
    return this.messages.join("\n");
  }
}

async function createSetup(prefix: string): Promise<Setup> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const home = join(root, "home");
  const repo = join(home, ".codexkeep");
  await createWorkspaceSkeleton(repo);
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    CODEXKEEP_CONFIG_DIR: repo,
    CODEXKEEP_STATE_DIR: join(root, "state"),
  };
  return { root, paths: createPaths(env), env };
}

function context(
  setup: Setup,
  ui: Ui,
  assumeYes = false,
): AppContext {
  return {
    paths: setup.paths,
    ui,
    assumeYes,
    signal: new AbortController().signal,
    env: setup.env,
  };
}

async function writeSkill(
  root: string,
  name: string,
  content: string,
): Promise<void> {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "SKILL.md"), content);
}

async function skillText(root: string, name: string): Promise<string> {
  return await readFile(join(root, name, "SKILL.md"), "utf8");
}
