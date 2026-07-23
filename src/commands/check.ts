import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AppContext } from "../app.js";
import {
  inventoryEquals,
  readInventory,
} from "../domain/inventory.js";
import { collectCodexInventory, findCodexCommand } from "../services/codex.js";
import { pathExists, readTextIfPresent } from "../services/files.js";
import {
  hasOrigin,
  isGitRepository,
  workingChanges,
} from "../services/git.js";
import { inspectLinks } from "../services/links.js";
import { linkSpecs } from "../services/paths.js";
import { extractPortableConfig } from "../services/config.js";

export async function checkCommand(context: AppContext): Promise<number> {
  const { ui, paths } = context;
  ui.title("CodexKeep Check", "检查当前设备");
  let failures = 0;

  const links = await inspectLinks(linkSpecs(paths));
  for (const link of links) {
    if (link.state === "ready") {
      ui.success(`${link.spec.label} 已连接`);
    } else if (link.state === "source-missing") {
      ui.warn(`${link.spec.label} 的仓库内容缺失`);
      failures += 1;
    } else if (link.state === "conflict") {
      ui.warn(`${link.spec.label} 正在使用其他内容`);
      failures += 1;
    } else {
      ui.warn(`${link.spec.label} 尚未连接`);
      failures += 1;
    }
  }

  const unexpectedSkills = await nonBuiltInCodexSkills(paths.codexHome);
  if (unexpectedSkills.length === 0) {
    ui.success("Codex 内置 skills 未纳入同步");
  } else {
    ui.warn(
      `~/.codex/skills 中还有 ${unexpectedSkills.length} 个非内置 skill，可能重复加载`,
    );
    failures += 1;
  }

  const codexCommand = await findCodexCommand(context.env);
  if (!codexCommand) {
    ui.warn("未找到 Codex CLI，无法核对插件");
    failures += 1;
  } else {
    try {
      const [expected, current] = await Promise.all([
        readInventory(join(paths.repo, "plugins.json")),
        collectCodexInventory({
          env: context.env,
          signal: context.signal,
          paths,
        }),
      ]);
      if (inventoryEquals(expected, current)) {
        ui.success("插件清单一致");
      } else {
        ui.warn("本机插件与私人仓库有差异");
        failures += 1;
      }
    } catch {
      ui.warn("暂时无法核对插件");
      failures += 1;
    }
  }

  try {
    const basePortable = extractPortableConfig(
      (await readTextIfPresent(paths.baseConfig)) ?? "",
    );
    const repositoryPortable = extractPortableConfig(
      (await readTextIfPresent(
        join(paths.repo, "codex", "codexkeep.config.toml"),
      )) ?? "",
    );
    if (basePortable === repositoryPortable) {
      ui.success("可移植 Codex 设置已应用");
    } else {
      ui.warn("本机 Codex 设置与私人仓库有差异");
      failures += 1;
    }
  } catch {
    ui.warn("Codex config.toml 无法解析");
    failures += 1;
  }

  const gitOptions = {
    cwd: paths.repo,
    env: context.env,
    signal: context.signal,
  };
  if (!(await isGitRepository(gitOptions))) {
    ui.warn("私人配置目录不是 Git 仓库");
    failures += 1;
  } else {
    const changes = await workingChanges(gitOptions);
    if (changes.length === 0) {
      ui.success("Git 工作区干净");
    } else {
      ui.warn(`有 ${changes.length} 项本地修改尚未同步`);
    }
    if (await hasOrigin(gitOptions)) {
      ui.success("已配置远程仓库");
    } else {
      ui.warn("尚未配置远程仓库；本地配置仍可正常使用");
    }
  }

  if (failures === 0) {
    ui.done("当前设备状态正常");
    return 0;
  }

  if (await pathExists(paths.lastError)) {
    ui.info(`最近一次技术详情：${paths.lastError}`);
  }
  ui.done(`发现 ${failures} 项需要处理`);
  return 1;
}

async function nonBuiltInCodexSkills(codexHome: string): Promise<string[]> {
  const root = join(codexHome, "skills");
  try {
    return (await readdir(root)).filter(
      (name) => name !== ".system" && name !== ".DS_Store",
    );
  } catch {
    return [];
  }
}
