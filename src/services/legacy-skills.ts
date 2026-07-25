import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rm,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  copyPath,
  fingerprint,
  isDirectory,
  isNodeError,
  pathExists,
} from "./files.js";

export type LegacySkillState = "duplicate" | "legacy-only" | "conflict";
export type LegacySkillChoice = "repository" | "legacy";

export interface LegacySkillEntry {
  readonly name: string;
  readonly legacyPath: string;
  readonly repositoryPath: string;
  readonly state: LegacySkillState;
  readonly legacyFingerprint: string;
  readonly repositoryFingerprint?: string;
}

export interface LegacySkillInspection {
  readonly legacyRoot: string;
  readonly repositoryRoot: string;
  readonly entries: readonly LegacySkillEntry[];
}

export interface LegacySkillMigration {
  readonly backupDir: string;
  readonly archived: readonly string[];
  readonly imported: readonly string[];
  readonly replaced: readonly string[];
  rollback(): Promise<void>;
}

export class LegacySkillMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacySkillMigrationError";
  }
}

export class LegacySkillRollbackError extends Error {
  constructor(
    readonly backupDir: string,
    migrationError: unknown,
    rollbackError: unknown,
  ) {
    super("Legacy skill migration and rollback both failed.", {
      cause: new AggregateError([migrationError, rollbackError]),
    });
    this.name = "LegacySkillRollbackError";
  }
}

export async function listLegacySkillNames(
  codexHome: string,
): Promise<string[]> {
  const root = join(codexHome, "skills");
  try {
    return (await readdir(root))
      .filter((name) => name !== ".system" && name !== ".DS_Store")
      .sort();
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return [];
    throw error;
  }
}

export async function inspectLegacySkills(
  codexHome: string,
  repositoryRoot: string,
): Promise<LegacySkillInspection> {
  const legacyRoot = join(codexHome, "skills");
  const entries: LegacySkillEntry[] = [];
  for (const name of await listLegacySkillNames(codexHome)) {
    const legacyPath = join(legacyRoot, name);
    const repositoryPath = join(repositoryRoot, name);
    const legacyFingerprint = await fingerprint(legacyPath);
    if (!(await pathExists(repositoryPath))) {
      entries.push({
        name,
        legacyPath,
        repositoryPath,
        state: "legacy-only",
        legacyFingerprint,
      });
      continue;
    }

    const repositoryFingerprint = await fingerprint(repositoryPath);
    const aliasesRepository = await legacyAliasesRepository(
      legacyPath,
      repositoryPath,
    );
    entries.push({
      name,
      legacyPath,
      repositoryPath,
      state:
        aliasesRepository || legacyFingerprint === repositoryFingerprint
          ? "duplicate"
          : "conflict",
      legacyFingerprint,
      repositoryFingerprint,
    });
  }
  return { legacyRoot, repositoryRoot, entries };
}

export function createLegacySkillBackupPath(stateDir: string): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return join(
    stateDir,
    "backups",
    `legacy-skills-${timestamp}-${randomUUID()}`,
  );
}

export async function applyLegacySkillMigration(
  inspection: LegacySkillInspection,
  choices: Readonly<Record<string, LegacySkillChoice>>,
  backupDir: string,
): Promise<LegacySkillMigration> {
  validateChoices(inspection.entries, choices);
  await preflightMigration(inspection, choices, backupDir);

  const legacyBackupRoot = join(backupDir, "legacy");
  const repositoryBackupRoot = join(backupDir, "repository");
  const repositoryWrites = inspection.entries.filter(
    (entry) =>
      entry.state === "legacy-only" ||
      (entry.state === "conflict" && choices[entry.name] === "legacy"),
  );
  const repositoryReplacements = inspection.entries.filter(
    (entry) =>
      entry.state === "conflict" && choices[entry.name] === "legacy",
  );
  let backupsComplete = false;
  let mutationStarted = false;
  let rolledBack = false;

  const rollback = async (): Promise<void> => {
    if (rolledBack || !mutationStarted) return;

    for (const entry of [...repositoryWrites].reverse()) {
      await rm(entry.repositoryPath, { recursive: true, force: true });
    }
    for (const entry of [...repositoryReplacements].reverse()) {
      await copyPath(
        join(repositoryBackupRoot, entry.name),
        entry.repositoryPath,
      );
    }
    for (const entry of [...inspection.entries].reverse()) {
      await rm(entry.legacyPath, { recursive: true, force: true });
      await copyPath(join(legacyBackupRoot, entry.name), entry.legacyPath);
    }
    rolledBack = true;
  };

  try {
    await mkdir(legacyBackupRoot, { recursive: true });
    for (const entry of inspection.entries) {
      await copyPath(entry.legacyPath, join(legacyBackupRoot, entry.name));
    }
    if (repositoryReplacements.length > 0) {
      await mkdir(repositoryBackupRoot, { recursive: true });
      for (const entry of repositoryReplacements) {
        await copyPath(
          entry.repositoryPath,
          join(repositoryBackupRoot, entry.name),
        );
      }
    }
    await verifyBackups(
      inspection.entries,
      repositoryReplacements,
      legacyBackupRoot,
      repositoryBackupRoot,
    );
    backupsComplete = true;

    mutationStarted = true;
    for (const entry of repositoryReplacements) {
      await rm(entry.repositoryPath, { recursive: true });
    }
    for (const entry of inspection.entries) {
      await rm(entry.legacyPath, { recursive: true });
    }
    for (const entry of repositoryWrites) {
      await copyPath(
        join(legacyBackupRoot, entry.name),
        entry.repositoryPath,
      );
    }
  } catch (error) {
    if (backupsComplete) {
      try {
        await rollback();
      } catch (rollbackError) {
        throw new LegacySkillRollbackError(
          backupDir,
          error,
          rollbackError,
        );
      }
    } else {
      await rm(backupDir, { recursive: true, force: true });
    }
    throw error;
  }

  return {
    backupDir,
    archived: inspection.entries.map((entry) => entry.name),
    imported: inspection.entries
      .filter((entry) => entry.state === "legacy-only")
      .map((entry) => entry.name),
    replaced: repositoryReplacements.map((entry) => entry.name),
    rollback,
  };
}

function validateChoices(
  entries: readonly LegacySkillEntry[],
  choices: Readonly<Record<string, LegacySkillChoice>>,
): void {
  for (const entry of entries) {
    if (entry.state === "conflict" && choices[entry.name] === undefined) {
      throw new Error(`Missing conflict resolution for skill: ${entry.name}`);
    }
  }
}

async function preflightMigration(
  inspection: LegacySkillInspection,
  choices: Readonly<Record<string, LegacySkillChoice>>,
  backupDir: string,
): Promise<void> {
  if (!(await isDirectory(inspection.legacyRoot))) {
    throw new LegacySkillMigrationError(
      "~/.codex/skills 不是普通目录，无法安全整理旧 skill。",
    );
  }
  if (!(await isDirectory(inspection.repositoryRoot))) {
    throw new Error("Repository skill root is not a directory.");
  }
  if (await pathExists(backupDir)) {
    throw new Error(`Backup path already exists: ${backupDir}`);
  }

  const backupParent = dirname(backupDir);
  if (
    (await pathExists(backupParent)) &&
    !(await isDirectory(backupParent))
  ) {
    throw new Error(`Backup parent is not a directory: ${backupParent}`);
  }

  for (const entry of inspection.entries) {
    if (
      !(await pathExists(entry.legacyPath)) ||
      (await fingerprint(entry.legacyPath)) !== entry.legacyFingerprint
    ) {
      throw new Error(`Legacy skill changed during preflight: ${entry.name}`);
    }
    if (entry.repositoryFingerprint === undefined) {
      if (await pathExists(entry.repositoryPath)) {
        throw new Error(
          `Repository skill changed during preflight: ${entry.name}`,
        );
      }
    } else if (
      !(await pathExists(entry.repositoryPath)) ||
      (await fingerprint(entry.repositoryPath)) !==
        entry.repositoryFingerprint
    ) {
      throw new Error(
        `Repository skill changed during preflight: ${entry.name}`,
      );
    }
  }

  for (const entry of inspection.entries) {
    const source =
      entry.state === "legacy-only" ||
      (entry.state === "conflict" && choices[entry.name] === "legacy")
        ? entry.legacyPath
        : entry.repositoryPath;
    await assertPortableSkill(entry.name, source);
  }
}

async function verifyBackups(
  entries: readonly LegacySkillEntry[],
  repositoryReplacements: readonly LegacySkillEntry[],
  legacyBackupRoot: string,
  repositoryBackupRoot: string,
): Promise<void> {
  for (const entry of entries) {
    if (
      (await fingerprint(join(legacyBackupRoot, entry.name))) !==
      entry.legacyFingerprint
    ) {
      throw new Error(`Legacy skill backup is incomplete: ${entry.name}`);
    }
  }
  for (const entry of repositoryReplacements) {
    if (
      (await fingerprint(join(repositoryBackupRoot, entry.name))) !==
      entry.repositoryFingerprint
    ) {
      throw new Error(`Repository skill backup is incomplete: ${entry.name}`);
    }
  }
}

async function legacyAliasesRepository(
  legacyPath: string,
  repositoryPath: string,
): Promise<boolean> {
  try {
    const [legacyStat, repositoryStat] = await Promise.all([
      lstat(legacyPath),
      lstat(repositoryPath),
    ]);
    return (
      legacyStat.isSymbolicLink() &&
      !repositoryStat.isSymbolicLink() &&
      (await realpath(legacyPath)) === (await realpath(repositoryPath))
    );
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

async function assertPortableSkill(
  name: string,
  root: string,
  current = root,
): Promise<void> {
  const stat = await lstat(current);
  if (stat.isSymbolicLink()) {
    const target = await readlink(current);
    const resolvedTarget = resolve(dirname(current), target);
    const targetRelative = relative(root, resolvedTarget);
    if (
      current === root ||
      isAbsolute(target) ||
      !targetRelative ||
      targetRelative === ".." ||
      targetRelative.startsWith(`..${sep}`) ||
      isAbsolute(targetRelative)
    ) {
      throw new LegacySkillMigrationError(
        `skill “${name}” 含有机器路径或目录外符号链接，无法安全写入仓库：${current}`,
      );
    }
    return;
  }
  if (stat.isFile()) return;
  if (!stat.isDirectory()) {
    throw new LegacySkillMigrationError(
      `skill “${name}” 含有不支持的文件类型，无法安全写入仓库：${current}`,
    );
  }
  for (const entry of await readdir(current)) {
    await assertPortableSkill(name, root, join(current, entry));
  }
}
