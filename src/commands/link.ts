import { join } from "node:path";
import type { AppContext } from "../app.js";
import {
  applyLinks,
  inspectLinks,
  preflightLinks,
  validateConfigRepository,
} from "../services/links.js";
import {
  applyLegacySkillMigration,
  createLegacySkillBackupPath,
  inspectLegacySkills,
} from "../services/legacy-skills.js";
import { linkSpecs } from "../services/paths.js";
import {
  legacySkillPlan,
  reportLegacySkillMigration,
  reportLegacySkillMigrationError,
  resolveLegacySkillConflicts,
} from "./legacy-skills.js";

export async function linkCommand(context: AppContext): Promise<number> {
  const { ui, paths } = context;
  const specs = linkSpecs(paths);
  ui.title("CodexKeep Link", "连接当前设备");

  try {
    await validateConfigRepository(specs);
  } catch {
    ui.error("私人配置仓库不完整，未创建任何链接");
    ui.info("运行 codexkeep check 可查看缺少的内容");
    return 1;
  }

  const statuses = await inspectLinks(specs);
  const conflicts = statuses.filter((entry) => entry.state === "conflict");
  if (conflicts.length > 0) {
    ui.error("这台设备已有不同配置，未创建任何链接");
    for (const conflict of conflicts) {
      ui.warn(`${conflict.spec.label}：${conflict.spec.target}`);
    }
    ui.info("请使用 codexkeep init 进行一次性安全合并");
    return 1;
  }

  const legacySkills = await inspectLegacySkills(
    paths.codexHome,
    join(paths.repo, "skills"),
  );
  const resolutions = await resolveLegacySkillConflicts(
    context,
    legacySkills.entries,
  );
  if (!resolutions) return context.assumeYes || !ui.interactive ? 1 : 0;

  const pending = statuses.filter((entry) => entry.state === "missing");
  if (pending.length === 0 && legacySkills.entries.length === 0) {
    ui.done("当前设备已经连接，无需修改");
    return 0;
  }

  const backupDir =
    legacySkills.entries.length > 0
      ? createLegacySkillBackupPath(paths.state)
      : undefined;
  ui.line("将进行以下修复：");
  const plan = [
    ...pending.map(
      (entry) => `建立连接：${entry.spec.label} → ${entry.spec.target}`,
    ),
    ...legacySkillPlan(legacySkills.entries, resolutions),
  ];
  ui.list(plan);
  if (backupDir) ui.info(`旧 skill 备份将保存到 ${backupDir}`);
  if (!(await ui.confirm("执行这些修复？"))) {
    ui.cancelled();
    return 0;
  }

  let migration:
    | Awaited<ReturnType<typeof applyLegacySkillMigration>>
    | undefined;
  try {
    await preflightLinks(specs, false);
    if (backupDir) {
      migration = await applyLegacySkillMigration(
        legacySkills,
        resolutions,
        backupDir,
      );
    }
    const result = await applyLinks(specs, paths.state, false);
    for (const target of result.created) ui.success(`已连接 ${target}`);
    if (migration) {
      reportLegacySkillMigration(ui, migration);
    }
    ui.done(
      migration ? "当前设备已连接，旧目录 skill 已整理" : "当前设备已连接",
    );
    return 0;
  } catch (error) {
    if (migration) {
      try {
        await migration.rollback();
      } catch (rollbackError) {
        ui.error("自动恢复未完成，备份仍然保留");
        throw new AggregateError(
          [error, rollbackError],
          "Link and legacy skill rollback failed.",
        );
      }
    }
    reportLegacySkillMigrationError(
      ui,
      error,
      "连接或 skill 整理未完成，原内容已经恢复",
    );
    return 1;
  }
}
