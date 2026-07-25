import { lstat, mkdir, readFile, rename, rm, rmdir, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { LinkSpec } from "./paths.js";
import {
  isDirectory,
  pathExists,
  sameSymlink,
} from "./files.js";
import { parseInventory } from "../domain/inventory.js";

export interface LinkStatus {
  readonly spec: LinkSpec;
  readonly state: "ready" | "missing" | "conflict" | "source-missing";
}

export interface LinkApplyResult {
  readonly created: readonly string[];
  readonly adopted: readonly string[];
  readonly backupDir?: string;
}

export async function inspectLinks(
  specs: readonly LinkSpec[],
): Promise<LinkStatus[]> {
  const result: LinkStatus[] = [];
  for (const spec of specs) {
    if (!(await pathExists(spec.source))) {
      result.push({ spec, state: "source-missing" });
    } else if (await sameSymlink(spec.source, spec.target)) {
      result.push({ spec, state: "ready" });
    } else if (await pathExists(spec.target)) {
      result.push({ spec, state: "conflict" });
    } else {
      result.push({ spec, state: "missing" });
    }
  }
  return result;
}

export async function validateConfigRepository(
  specs: readonly LinkSpec[],
): Promise<void> {
  for (const { source, label } of specs) {
    if (!(await pathExists(source))) {
      throw new Error(`Configuration repository is missing ${label}.`);
    }
  }

  for (const spec of specs.filter(
    (entry) => entry.label === "个人 skills" || entry.label === "自定义 agents",
  )) {
    if (!(await isDirectory(spec.source))) {
      throw new Error(`${spec.label} must be a directory.`);
    }
  }

  for (const spec of specs.filter(
    (entry) => entry.label !== "个人 skills" && entry.label !== "自定义 agents",
  )) {
    if ((await lstat(spec.source)).isDirectory()) {
      throw new Error(`${spec.label} must be a file.`);
    }
  }

  const inventory = specs[0]?.source
    ? join(dirname(specs[0].source), "plugins.json")
    : undefined;
  if (!inventory || !(await pathExists(inventory))) {
    throw new Error("Configuration repository is missing plugins.json.");
  }
  parseInventory(await readFile(inventory, "utf8"));
}

export async function applyLinks(
  specs: readonly LinkSpec[],
  stateDir: string,
  adoptExisting: boolean,
): Promise<LinkApplyResult> {
  const status = await preflightLinks(specs, adoptExisting);
  const conflicts = status.filter((entry) => entry.state === "conflict");
  const actionable = status.filter((entry) => entry.state !== "ready");
  if (actionable.length === 0) return { created: [], adopted: [] };

  const backupDir =
    conflicts.length > 0
      ? join(
          stateDir,
          "backups",
          `links-${new Date().toISOString().replaceAll(":", "-")}`,
        )
      : undefined;
  const createdParents: string[] = [];
  const createdLinks: LinkSpec[] = [];
  const backups: { target: string; backup: string }[] = [];

  try {
    if (backupDir) await mkdir(backupDir, { recursive: true });
    for (const parent of linkParents(status)) {
      if (!(await pathExists(parent))) {
        await mkdir(parent, { recursive: true });
        createdParents.push(parent);
      }
    }

    for (const entry of actionable) {
      const { spec } = entry;
      if (entry.state === "conflict") {
        if (!backupDir) throw new Error("Backup directory was not created.");
        const backup = join(
          backupDir,
          `${basename(spec.target)}-${backups.length + 1}`,
        );
        await rename(spec.target, backup);
        backups.push({ target: spec.target, backup });
      }
      await symlink(spec.source, spec.target);
      createdLinks.push(spec);
    }
  } catch (error) {
    for (const spec of createdLinks.reverse()) {
      if (await sameSymlink(spec.source, spec.target)) {
        await rm(spec.target);
      }
    }
    for (const item of backups.reverse()) {
      if (!(await pathExists(item.target)) && (await pathExists(item.backup))) {
        await rename(item.backup, item.target);
      }
    }
    for (const parent of createdParents.reverse()) {
      await rmdir(parent).catch(() => undefined);
    }
    throw error;
  }

  return {
    created: createdLinks.map((spec) => spec.target),
    adopted: backups.map((item) => item.target),
    ...(backupDir === undefined ? {} : { backupDir }),
  };
}

export async function preflightLinks(
  specs: readonly LinkSpec[],
  adoptExisting: boolean,
): Promise<LinkStatus[]> {
  const status = await inspectLinks(specs);
  const missingSources = status.filter(
    (entry) => entry.state === "source-missing",
  );
  if (missingSources.length > 0) {
    throw new Error(
      `Missing source: ${missingSources.map((entry) => entry.spec.label).join(", ")}`,
    );
  }
  const conflicts = status.filter((entry) => entry.state === "conflict");
  if (conflicts.length > 0 && !adoptExisting) {
    throw new Error(
      `Existing content: ${conflicts.map((entry) => entry.spec.target).join(", ")}`,
    );
  }

  for (const parent of linkParents(status)) {
    if ((await pathExists(parent)) && !(await isDirectory(parent))) {
      throw new Error(`Link parent is not a directory: ${parent}`);
    }
  }

  return status;
}

function linkParents(status: readonly LinkStatus[]): string[] {
  return [
    ...new Set(
      status
        .filter((entry) => entry.state !== "ready")
        .map((entry) => dirname(entry.spec.target)),
    ),
  ];
}
