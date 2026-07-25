import type { AppContext } from "../app.js";
import {
  type LegacySkillChoice,
  type LegacySkillEntry,
  type LegacySkillMigration,
  LegacySkillMigrationError,
  LegacySkillRollbackError,
} from "../services/legacy-skills.js";
import type { Ui } from "../ui/index.js";

export interface LegacySkillCounts {
  readonly duplicate: number;
  readonly legacyOnly: number;
  readonly conflict: number;
}

export function countLegacySkills(
  entries: readonly LegacySkillEntry[],
): LegacySkillCounts {
  return {
    duplicate: entries.filter((entry) => entry.state === "duplicate").length,
    legacyOnly: entries.filter((entry) => entry.state === "legacy-only").length,
    conflict: entries.filter((entry) => entry.state === "conflict").length,
  };
}

export function legacySkillSummary(
  entries: readonly LegacySkillEntry[],
): string[] {
  const counts = countLegacySkills(entries);
  return [
    `${counts.duplicate} 个重复副本`,
    `${counts.legacyOnly} 个仅存在于旧目录`,
    `${counts.conflict} 个内容冲突`,
  ];
}

export async function resolveLegacySkillConflicts(
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
      { value: "legacy", label: "保留 ~/.codex/skills 旧目录版本" },
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
        { value: "legacy", label: "保留 ~/.codex/skills 旧目录版本" },
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

export function legacySkillPlan(
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
      ? [`清理 ${duplicates.length} 个内容相同的旧目录副本`]
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
          `保留仓库版本并清理旧目录副本：${keepRepository
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

export function reportLegacySkillMigration(
  ui: Ui,
  migration: LegacySkillMigration,
): void {
  ui.success(`已整理 ${migration.archived.length} 个旧目录 skill`);
  ui.info(`原内容已备份到 ${migration.backupDir}`);
  if (migration.imported.length > 0 || migration.replaced.length > 0) {
    ui.info("skill 仓库内容已更新；运行 codexkeep sync 可提交并同步");
  }
}

export function reportLegacySkillMigrationError(
  ui: Ui,
  error: unknown,
  fallback: string,
): void {
  if (error instanceof LegacySkillRollbackError) {
    ui.error("自动恢复未完成，旧目录 skill 备份仍然保留");
    ui.info(`请从这里恢复：${error.backupDir}`);
    return;
  }
  ui.error(
    error instanceof LegacySkillMigrationError ? error.message : fallback,
  );
}
