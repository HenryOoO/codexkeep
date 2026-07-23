import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { dump, load } from "js-toml";
import { atomicWrite, pathExists, readTextIfPresent } from "./files.js";

const PORTABLE_SCALARS = [
  "model",
  "model_reasoning_effort",
  "approval_policy",
  "approvals_reviewer",
  "sandbox_mode",
] as const;

export function extractPortableConfig(raw: string): string {
  if (!raw.trim()) return "";
  const parsed = load(raw);
  if (!isRecord(parsed)) {
    throw new Error("Codex config.toml must contain a TOML table.");
  }

  const portable: Record<string, unknown> = {};
  for (const key of PORTABLE_SCALARS) {
    const value = parsed[key];
    if (typeof value === "string" || typeof value === "boolean") {
      portable[key] = value;
    }
  }

  if (isRecord(parsed.features)) {
    const features = Object.fromEntries(
      Object.entries(parsed.features).filter(
        ([key, value]) => !looksSecretKey(key) && typeof value === "boolean",
      ),
    );
    if (Object.keys(features).length > 0) portable.features = features;
  }

  const skills = sanitizeSkills(parsed.skills);
  if (skills !== undefined) portable.skills = skills;

  const agents = sanitizeAgents(parsed.agents);
  if (agents !== undefined) portable.agents = agents;

  return Object.keys(portable).length === 0 ? "" : `${dump(portable)}\n`;
}

export function mergePortableConfig(
  baseRaw: string,
  previousPortableRaw: string,
  desiredPortableRaw: string,
): string {
  const base = parseTomlRecord(baseRaw);
  const previous = parseTomlRecord(
    extractPortableConfig(previousPortableRaw),
  );
  const desired = parseTomlRecord(extractPortableConfig(desiredPortableRaw));

  for (const key of PORTABLE_SCALARS) {
    if (key in previous) delete base[key];
    if (key in desired) base[key] = desired[key];
  }

  mergeManagedRecord(base, previous, desired, "features");
  mergeManagedRecord(base, previous, desired, "agents");

  const baseSkills = isRecord(base.skills) ? { ...base.skills } : {};
  const previousSkills = isRecord(previous.skills) ? previous.skills : {};
  const desiredSkills = isRecord(desired.skills) ? desired.skills : {};
  if ("config" in previousSkills) delete baseSkills.config;
  if ("config" in desiredSkills) baseSkills.config = desiredSkills.config;
  if (Object.keys(baseSkills).length > 0) {
    base.skills = baseSkills;
  } else {
    delete base.skills;
  }

  return Object.keys(base).length === 0 ? "" : `${dump(base)}\n`;
}

export async function applyPortableConfig(
  baseConfig: string,
  stateDir: string,
  previousPortableRaw: string,
  desiredPortableRaw: string,
): Promise<string | undefined> {
  const raw = (await readTextIfPresent(baseConfig)) ?? "";
  const merged = mergePortableConfig(
    raw,
    previousPortableRaw,
    desiredPortableRaw,
  );
  if (sameTomlData(raw, merged)) return undefined;

  await mkdir(stateDir, { recursive: true });
  const backup = join(
    stateDir,
    `config.toml.${new Date().toISOString().replaceAll(":", "-")}.${randomUUID()}.backup`,
  );
  await writeFile(backup, raw);
  await atomicWrite(baseConfig, merged);
  return backup;
}

export async function readPortableBaseConfig(
  baseConfig: string,
): Promise<string> {
  const raw = await readTextIfPresent(baseConfig);
  return raw === undefined ? "" : extractPortableConfig(raw);
}

export async function validateTomlFile(path: string): Promise<void> {
  const raw = await readFile(path, "utf8");
  if (raw.trim()) load(raw);
}

export async function ensureProfileFile(
  path: string,
  content = "",
): Promise<void> {
  if (await pathExists(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(
    path,
    content || "# Portable Codex preferences managed by CodexKeep.\n",
  );
}

function sanitizeSkills(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !Array.isArray(value.config)) return undefined;
  const config = value.config
    .map(sanitizeRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
  return config.length === 0 ? undefined : { config };
}

function sanitizeAgents(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const agents: Record<string, unknown> = {};
  for (const [name, rawAgent] of Object.entries(value)) {
    if (looksSecretKey(name) || !isRecord(rawAgent)) continue;
    const configFile = rawAgent.config_file;
    if (
      typeof configFile === "string" &&
      !isAbsolute(configFile) &&
      !configFile.startsWith("~") &&
      !configFile.includes("..")
    ) {
      agents[name] = { config_file: configFile };
    }
  }
  return Object.keys(agents).length === 0 ? undefined : agents;
}

function sanitizeRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (looksSecretKey(key)) continue;
    if (
      typeof entry === "string" &&
      (isAbsolute(entry) || entry.startsWith("~"))
    ) {
      continue;
    }
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      result[key] = entry;
    } else if (
      Array.isArray(entry) &&
      entry.every(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
    ) {
      result[key] = entry;
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function looksSecretKey(key: string): boolean {
  return /(token|secret|password|credential|authorization|api[_-]?key|header|env)/iu.test(
    key,
  );
}

function mergeManagedRecord(
  base: Record<string, unknown>,
  previous: Record<string, unknown>,
  desired: Record<string, unknown>,
  key: "features" | "agents",
): void {
  const baseRecord = isRecord(base[key]) ? { ...base[key] } : {};
  const previousRecord = isRecord(previous[key]) ? previous[key] : {};
  const desiredRecord = isRecord(desired[key]) ? desired[key] : {};
  for (const managedKey of Object.keys(previousRecord)) {
    delete baseRecord[managedKey];
  }
  Object.assign(baseRecord, desiredRecord);
  if (Object.keys(baseRecord).length > 0) {
    base[key] = baseRecord;
  } else {
    delete base[key];
  }
}

function parseTomlRecord(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const value = load(raw);
  if (!isRecord(value)) {
    throw new Error("Codex config.toml must contain a TOML table.");
  }
  return { ...value };
}

function sameTomlData(left: string, right: string): boolean {
  return (
    JSON.stringify(canonicalize(parseTomlRecord(left))) ===
    JSON.stringify(canonicalize(parseTomlRecord(right)))
  );
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
