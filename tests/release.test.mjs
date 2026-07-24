import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  ReleaseError,
  assertReleaseMetadata,
  assertStableVersion,
  parseSyncCounts,
  runPreflight,
  runRelease,
} from "../scripts/release.mjs";
import { verifyReleaseTag } from "../scripts/verify-release-tag.mjs";

const roots = [];
const exec = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bumpp = resolve(projectRoot, "node_modules", ".bin", "bumpp");

after(async () => {
  await Promise.all(
    roots.map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-release-"));
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "codexkeep", version: "0.1.0" }, null, 2)}\n`,
  );
  await writeFile(
    join(root, "src", "cli.ts"),
    '#!/usr/bin/env node\n\nconst VERSION = "0.1.0";\n',
  );
  return root;
}

function createFakeRunner(overrides = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    const key = `${command} ${args.join(" ")}`;
    if (key in overrides) {
      const value = overrides[key];
      if (value instanceof Error) throw value;
      return value;
    }
    if (key === "git branch --show-current") return "main";
    if (key === "git status --porcelain") return "";
    if (key === "git remote get-url origin") {
      return "git@github.com:HenryOoO/codexkeep.git";
    }
    if (key === "git rev-list --left-right --count HEAD...origin/main") {
      return "0\t0";
    }
    return "";
  };
  return { calls, run };
}

test("parses Git ahead and behind counts", () => {
  assert.deepEqual(parseSyncCounts("2\t3\n"), { ahead: 2, behind: 3 });
  assert.throws(() => parseSyncCounts("unknown"), ReleaseError);
});

test("preflight remains read-only apart from fetching the scoped remote", async () => {
  const root = await createFixture();
  const fake = createFakeRunner();

  await runPreflight({ cwd: root, run: fake.run });

  assert.deepEqual(fake.calls, [
    ["git", "branch", "--show-current"],
    ["git", "status", "--porcelain"],
    ["git", "remote", "get-url", "origin"],
    ["git", "fetch", "--quiet", "origin", "main"],
    ["git", "rev-list", "--left-right", "--count", "HEAD...origin/main"],
    ["gh", "auth", "status", "--hostname", "github.com"],
    ["pnpm", "check"],
    ["pnpm", "test"],
    ["pnpm", "build"],
  ]);
});

test("preflight rejects a dirty or unsynchronized release branch", async () => {
  const dirtyRoot = await createFixture();
  const dirty = createFakeRunner({
    "git status --porcelain": " M package.json",
  });
  await assert.rejects(
    async () => await runPreflight({ cwd: dirtyRoot, run: dirty.run }),
    /工作区不干净/u,
  );

  const behindRoot = await createFixture();
  const behind = createFakeRunner({
    "git rev-list --left-right --count HEAD...origin/main": "0\t1",
  });
  await assert.rejects(
    async () => await runPreflight({ cwd: behindRoot, run: behind.run }),
    /落后 1/u,
  );
});

test("release orchestration uses bumpp before creating the GitHub Release", async () => {
  const root = await createFixture();
  const fake = createFakeRunner();
  const events = [];

  const result = await runRelease({
    cwd: root,
    run: fake.run,
    inspectBump: async (options) => {
      events.push(["inspect", options.release]);
      return { state: { newVersion: "0.1.1" } };
    },
    applyBump: async (options) => {
      events.push(["apply", options.release]);
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify(
          { name: "codexkeep", version: "0.1.1" },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        join(root, "src", "cli.ts"),
        '#!/usr/bin/env node\n\nconst VERSION = "0.1.1";\n',
      );
      await options.execute({
        state: {
          newVersion: "0.1.1",
          updatedFiles: [
            resolve(root, "package.json"),
            resolve(root, "src/cli.ts"),
          ],
        },
      });
      return { newVersion: "0.1.1", tag: "v0.1.1" };
    },
  });

  assert.deepEqual(events, [
    ["inspect", "prompt"],
    ["apply", "0.1.1"],
  ]);
  assert.deepEqual(result, { version: "0.1.1", tag: "v0.1.1" });
  assert.deepEqual(fake.calls.at(-1), [
    "gh",
    "release",
    "create",
    "v0.1.1",
    "--verify-tag",
    "--generate-notes",
    "--title",
    "v0.1.1",
  ]);
});

test("bumpp updates both real release files together", async () => {
  const root = await createFixture();
  await exec(bumpp, [
    "--release",
    "0.1.1",
    "--no-commit",
    "--no-tag",
    "--no-push",
    "--yes",
    "package.json",
    "src/cli.ts",
  ], {
    cwd: root,
  });

  assert.deepEqual(await assertReleaseMetadata(root), {
    name: "codexkeep",
    version: "0.1.1",
    cliVersion: "0.1.1",
  });
});

test("version guards reject unchanged, prerelease, and mismatched versions", async () => {
  assert.throws(() => assertStableVersion("0.1.0", "0.1.0"), /新版本/u);
  assert.throws(() => assertStableVersion("0.1.0", "0.0.9"), /新版本/u);
  assert.throws(
    () => assertStableVersion("0.1.0", "0.2.0-beta.0"),
    /稳定版本/u,
  );
  assert.doesNotThrow(() => assertStableVersion("0.1.0", "0.2.0"));

  const root = await createFixture();
  await writeFile(
    join(root, "src", "cli.ts"),
    'const VERSION = "0.2.0";\n',
  );
  await assert.rejects(
    async () => await assertReleaseMetadata(root),
    /版本不一致/u,
  );
});

test("GitHub Release tag must match package.json", async () => {
  const root = await createFixture();
  assert.equal(await verifyReleaseTag("v0.1.0", root), "v0.1.0");
  await assert.rejects(
    async () => await verifyReleaseTag("v0.2.0", root),
    /版本不一致/u,
  );
});
