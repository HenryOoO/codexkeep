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
import {
  applyLegacySkillMigration,
  createLegacySkillBackupPath,
  inspectLegacySkills,
} from "../services/legacy-skills.js";
import { linkSpecs } from "../services/paths.js";
import { extractPortableConfig } from "../services/config.js";
import {
  legacySkillPlan,
  legacySkillSummary,
  reportLegacySkillMigration,
  reportLegacySkillMigrationError,
  resolveLegacySkillConflicts,
} from "./legacy-skills.js";

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

  const legacySkills = await inspectLegacySkills(
    paths.codexHome,
    join(paths.repo, "skills"),
  );
  if (legacySkills.entries.length === 0) {
    ui.success("Codex 内置 skills 未纳入同步");
  } else {
    ui.warn(
      `旧目录 ~/.codex/skills 中发现 ${legacySkills.entries.length} 个非内置 skill`,
    );
    ui.list(legacySkillSummary(legacySkills.entries));
    if (!ui.interactive || context.assumeYes) {
      ui.info("运行 codexkeep link 可安全整理这些 skill");
    }
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

  let repairedLegacySkills = false;
  if (
    legacySkills.entries.length > 0 &&
    ui.interactive &&
    !context.assumeYes
  ) {
    if (await ui.confirm("现在安全整理这些 skill？")) {
      const resolutions = await resolveLegacySkillConflicts(
        context,
        legacySkills.entries,
      );
      if (resolutions) {
        const backupDir = createLegacySkillBackupPath(paths.state);
        ui.line("将进行以下 skill 整理：");
        ui.list(legacySkillPlan(legacySkills.entries, resolutions));
        ui.info(`旧目录 skill 备份将保存到 ${backupDir}`);
        try {
          const migration = await applyLegacySkillMigration(
            legacySkills,
            resolutions,
            backupDir,
          );
          reportLegacySkillMigration(ui, migration);
          repairedLegacySkills = true;
          failures -= 1;
        } catch (error) {
          reportLegacySkillMigrationError(
            ui,
            error,
            "skill 整理未完成，原内容已经恢复",
          );
        }
      } else {
        ui.info("稍后可运行 codexkeep link 重新整理这些 skill");
      }
    } else {
      ui.info("稍后可运行 codexkeep link 整理这些 skill");
    }
  }

  if (failures === 0) {
    ui.done(
      repairedLegacySkills
        ? "旧目录 skill 已安全整理"
        : "当前设备状态正常",
    );
    return 0;
  }

  if (await pathExists(paths.lastError)) {
    ui.info(`最近一次技术详情：${paths.lastError}`);
  }
  ui.done(`发现 ${failures} 项需要处理`);
  return 1;
}
