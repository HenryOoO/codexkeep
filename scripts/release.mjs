#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { versionBump, versionBumpInfo } from "bumpp";

const expectedPackageName = "codexkeep";
const releaseFiles = ["package.json", "src/cli.ts"];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");

export class ReleaseError extends Error {}

export function createCommandRunner(cwd) {
  return (command, args, options = {}) => {
    const capture = options.capture === true;
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (result.error) {
      throw new ReleaseError(
        `无法运行 ${command}：${result.error.message}`,
        { cause: result.error },
      );
    }
    if (result.status !== 0) {
      const detail = capture ? result.stderr.trim() : "";
      throw new ReleaseError(
        `${command} ${args.join(" ")} 执行失败${detail ? `：${detail}` : ""}`,
      );
    }
    return capture ? result.stdout.trim() : "";
  };
}

export function parseSyncCounts(output) {
  const match = output.trim().match(/^(\d+)\s+(\d+)$/u);
  if (!match) {
    throw new ReleaseError(`无法解析 Git 同步状态：${output}`);
  }
  return {
    ahead: Number(match[1]),
    behind: Number(match[2]),
  };
}

export async function readReleaseMetadata(cwd) {
  const packageJson = JSON.parse(
    await readFile(resolve(cwd, "package.json"), "utf8"),
  );
  const cliSource = await readFile(resolve(cwd, "src/cli.ts"), "utf8");
  const cliVersion = cliSource.match(
    /^const VERSION = "([^"]+)";$/mu,
  )?.[1];

  if (typeof packageJson.name !== "string") {
    throw new ReleaseError("package.json 缺少有效的 name");
  }
  if (typeof packageJson.version !== "string") {
    throw new ReleaseError("package.json 缺少有效的 version");
  }
  if (!cliVersion) {
    throw new ReleaseError("src/cli.ts 缺少可识别的 VERSION");
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
    cliVersion,
  };
}

export async function assertReleaseMetadata(cwd, expectedVersion) {
  const metadata = await readReleaseMetadata(cwd);
  if (metadata.name !== expectedPackageName) {
    throw new ReleaseError(
      `发布包名必须是 ${expectedPackageName}，当前是 ${metadata.name}`,
    );
  }
  if (metadata.version !== metadata.cliVersion) {
    throw new ReleaseError(
      `版本不一致：package.json=${metadata.version}，CLI=${metadata.cliVersion}`,
    );
  }
  if (expectedVersion && metadata.version !== expectedVersion) {
    throw new ReleaseError(
      `版本更新失败：预期 ${expectedVersion}，实际 ${metadata.version}`,
    );
  }
  return metadata;
}

export async function runPreflight({ cwd, run }) {
  const branch = run("git", ["branch", "--show-current"], { capture: true });
  if (branch !== "main") {
    throw new ReleaseError(`只能从 main 发布，当前分支是 ${branch || "未知"}`);
  }

  const status = run("git", ["status", "--porcelain"], { capture: true });
  if (status) {
    throw new ReleaseError("工作区不干净，请先提交或处理现有改动");
  }

  run("git", ["remote", "get-url", "origin"], { capture: true });
  run("git", ["fetch", "--quiet", "origin", "main"]);
  const sync = parseSyncCounts(
    run(
      "git",
      ["rev-list", "--left-right", "--count", "HEAD...origin/main"],
      { capture: true },
    ),
  );
  if (sync.ahead || sync.behind) {
    throw new ReleaseError(
      `main 与 origin/main 未同步：领先 ${sync.ahead}，落后 ${sync.behind}`,
    );
  }

  run("gh", ["auth", "status", "--hostname", "github.com"]);
  await assertReleaseMetadata(cwd);

  run("pnpm", ["check"]);
  run("pnpm", ["test"]);
  run("pnpm", ["build"]);
}

export function assertStableVersion(currentVersion, newVersion) {
  const parseStable = (version) => {
    const match = version.match(
      /^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/u,
    );
    if (!match) {
      throw new ReleaseError(`当前发布流程只支持稳定版本：${version}`);
    }
    return match.slice(1, 4).map(Number);
  };
  const current = parseStable(currentVersion);
  const next = parseStable(newVersion);
  const comparison =
    Math.sign(next[0] - current[0]) ||
    Math.sign(next[1] - current[1]) ||
    Math.sign(next[2] - current[2]);
  if (comparison <= 0) {
    throw new ReleaseError("请选择一个高于当前版本的新版本");
  }
}

export async function runRelease({
  cwd = defaultRoot,
  run = createCommandRunner(cwd),
  inspectBump = versionBumpInfo,
  applyBump = versionBump,
} = {}) {
  await runPreflight({ cwd, run });
  const current = await assertReleaseMetadata(cwd);
  const commonOptions = {
    cwd,
    files: releaseFiles,
    commit: "chore: release v%s",
    tag: "v%s",
    push: true,
    ignoreScripts: true,
  };

  const selection = await inspectBump({
    ...commonOptions,
    release: "prompt",
  });
  const newVersion = selection.state.newVersion;
  assertStableVersion(current.version, newVersion);

  const result = await applyBump({
    ...commonOptions,
    release: newVersion,
    confirm: true,
    execute: async (operation) => {
      await assertReleaseMetadata(cwd, operation.state.newVersion);
      const updated = new Set(
        operation.state.updatedFiles.map((path) => resolve(path)),
      );
      for (const file of releaseFiles) {
        const expectedPath = resolve(cwd, file);
        if (!updated.has(expectedPath)) {
          throw new ReleaseError(`${file} 未被 bumpp 更新`);
        }
      }
    },
  });

  const metadata = await assertReleaseMetadata(cwd, result.newVersion);
  const tag = `v${metadata.version}`;
  if (result.tag !== tag) {
    throw new ReleaseError(`bumpp tag 不符合预期：${result.tag || "未创建"}`);
  }

  const releaseArgs = [
    "release",
    "create",
    tag,
    "--verify-tag",
    "--generate-notes",
    "--title",
    tag,
  ];
  try {
    run("gh", releaseArgs);
  } catch (error) {
    console.error(
      `GitHub Release 创建失败。提交和 tag 已推送，请重试：\n` +
        `gh ${releaseArgs.join(" ")}`,
    );
    throw error;
  }

  return { version: metadata.version, tag };
}

async function main() {
  try {
    const result = await runRelease();
    console.log(`已发布 GitHub Release ${result.tag}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await main();
}
