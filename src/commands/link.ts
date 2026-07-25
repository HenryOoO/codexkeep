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
  type LegacySkillChoice,
  type LegacySkillEntry,
  LegacySkillMigrationError,
  LegacySkillRollbackError,
} from "../services/legacy-skills.js";
import { linkSpecs } from "../services/paths.js";

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
      ui.success(`已整理 ${migration.archived.length} 个旧版 skill`);
      ui.info(`原内容已备份到 ${migration.backupDir}`);
      if (migration.imported.length > 0 || migration.replaced.length > 0) {
        ui.info("skill 仓库内容已更新；运行 codexkeep sync 可提交并同步");
      }
    }
    ui.done(
      migration ? "当前设备已连接，重复 skill 已清理" : "当前设备已连接",
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
    if (error instanceof LegacySkillRollbackError) {
      ui.error("自动恢复未完成，旧 skill 备份仍然保留");
      ui.info(`请从这里恢复：${error.backupDir}`);
      return 1;
    }
    ui.error(
      error instanceof LegacySkillMigrationError
        ? error.message
        : "连接或 skill 整理未完成，原内容已经恢复",
    );
    return 1;
  }
}

async function resolveLegacySkillConflicts(
  context: AppContext,
  entries: readonly LegacySkillEntry[],
): Promise<Record<string, LegacySkillChoice> | undefined> {
  const conflicts = entries.filter((entry) => entry.state === "conflict");
  if (conflicts.length === 0) return {};

  const { ui } = context;
  if (context.assumeYes || !ui.interactive) {
    ui.error("旧目录与仓库中存在内容不同的同名 skill，未修改任何内容");
    ui.list(conflicts.map((entry) => entry.name));
    ui.info("请不带 --yes 重新运行 codexkeep link 并选择要保留的版本");
    return undefined;
  }

  const mode = await ui.choose(
    `${conflicts.length} 个同名 skill 内容不同，保留哪边？`,
    [
      {
        value: "repository",
        label: "保留 CodexKeep 仓库版本",
        hint: "推荐用于新机器",
      },
      { value: "legacy", label: "保留 ~/.codex/skills 旧版本" },
      { value: "individual", label: "逐个选择" },
      { value: "cancel", label: "取消" },
    ] as const,
    "cancel",
  );
  if (mode === "cancel") {
    ui.cancelled();
    return undefined;
  }

  const resolutions: Record<string, LegacySkillChoice> = {};
  if (mode === "repository" || mode === "legacy") {
    for (const entry of conflicts) resolutions[entry.name] = mode;
    return resolutions;
  }

  for (const entry of conflicts) {
    const choice = await ui.choose(
      `skill “${entry.name}” 保留哪边？`,
      [
        {
          value: "repository",
          label: "保留 CodexKeep 仓库版本",
          hint: "推荐用于新机器",
        },
        { value: "legacy", label: "保留 ~/.codex/skills 旧版本" },
        { value: "cancel", label: "取消" },
      ] as const,
      "cancel",
    );
    if (choice === "cancel") {
      ui.cancelled();
      return undefined;
    }
    resolutions[entry.name] = choice;
  }
  return resolutions;
}

function legacySkillPlan(
  entries: readonly LegacySkillEntry[],
  resolutions: Readonly<Record<string, LegacySkillChoice>>,
): string[] {
  const duplicates = entries.filter((entry) => entry.state === "duplicate");
  const legacyOnly = entries.filter((entry) => entry.state === "legacy-only");
  const keepRepository = entries.filter(
    (entry) =>
      entry.state === "conflict" &&
      resolutions[entry.name] === "repository",
  );
  const keepLegacy = entries.filter(
    (entry) =>
      entry.state === "conflict" && resolutions[entry.name] === "legacy",
  );

  return [
    ...(duplicates.length > 0
      ? [`清理 ${duplicates.length} 个内容相同的旧 skill 副本`]
      : []),
    ...(legacyOnly.length > 0
      ? [
          `导入 ${legacyOnly.length} 个仅存在于旧目录的 skill：${legacyOnly
            .map((entry) => entry.name)
            .join("、")}`,
        ]
      : []),
    ...(keepRepository.length > 0
      ? [
          `保留仓库版本并清理旧副本：${keepRepository
            .map((entry) => entry.name)
            .join("、")}`,
        ]
      : []),
    ...(keepLegacy.length > 0
      ? [
          `用旧目录版本更新仓库：${keepLegacy
            .map((entry) => entry.name)
            .join("、")}`,
        ]
      : []),
  ];
}
