import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  applyLegacySkillMigration,
  inspectLegacySkills,
  listLegacySkillNames,
} from "../src/services/legacy-skills.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(
    roots.map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

test("archives duplicates, imports legacy-only skills, and can roll back", async () => {
  const root = await createRoot("codexkeep-legacy-skills-");
  const codexHome = join(root, ".codex");
  const repository = join(root, ".codexkeep", "skills");
  const legacy = join(codexHome, "skills");
  const backup = join(root, "state", "backups", "migration");

  await writeSkill(repository, "duplicate", "same");
  await writeSkill(repository, "conflict", "repository");
  await writeSkill(legacy, "duplicate", "same");
  await writeSkill(legacy, "legacy-only", "legacy");
  await writeSkill(legacy, "conflict", "old");
  await writeSkill(join(legacy, ".system"), "builtin", "keep");
  await writeFile(join(legacy, ".DS_Store"), "keep");

  const inspection = await inspectLegacySkills(codexHome, repository);
  assert.deepEqual(
    inspection.entries.map((entry) => [entry.name, entry.state]),
    [
      ["conflict", "conflict"],
      ["duplicate", "duplicate"],
      ["legacy-only", "legacy-only"],
    ],
  );

  const migration = await applyLegacySkillMigration(
    inspection,
    { conflict: "repository" },
    backup,
  );

  assert.deepEqual(migration.archived, [
    "conflict",
    "duplicate",
    "legacy-only",
  ]);
  assert.deepEqual(migration.imported, ["legacy-only"]);
  assert.deepEqual(migration.replaced, []);
  assert.equal(await skillText(repository, "conflict"), "repository");
  assert.equal(await skillText(repository, "duplicate"), "same");
  assert.equal(await skillText(repository, "legacy-only"), "legacy");
  assert.deepEqual((await readdir(legacy)).sort(), [".DS_Store", ".system"]);
  assert.equal(await skillText(join(backup, "legacy"), "conflict"), "old");
  assert.equal(await skillText(join(legacy, ".system"), "builtin"), "keep");

  await migration.rollback();
  await migration.rollback();

  assert.equal(await skillText(legacy, "conflict"), "old");
  assert.equal(await skillText(legacy, "duplicate"), "same");
  assert.equal(await skillText(legacy, "legacy-only"), "legacy");
  assert.equal(await skillText(repository, "conflict"), "repository");
  await assert.rejects(
    async () => await access(join(repository, "legacy-only")),
  );
});

test("keeps a selected legacy conflict and restores both sides on rollback", async () => {
  const root = await createRoot("codexkeep-legacy-conflict-");
  const codexHome = join(root, ".codex");
  const repository = join(root, ".codexkeep", "skills");
  const legacy = join(codexHome, "skills");
  const backup = join(root, "state", "backups", "migration");
  await writeSkill(repository, "demo", "repository");
  await writeSkill(legacy, "demo", "legacy");

  const inspection = await inspectLegacySkills(codexHome, repository);
  await assert.rejects(
    async () =>
      await applyLegacySkillMigration(inspection, {}, join(root, "missing")),
    /Missing conflict resolution/u,
  );
  assert.equal(await skillText(repository, "demo"), "repository");
  assert.equal(await skillText(legacy, "demo"), "legacy");

  const migration = await applyLegacySkillMigration(
    inspection,
    { demo: "legacy" },
    backup,
  );
  assert.equal(await skillText(repository, "demo"), "legacy");
  await assert.rejects(async () => await access(join(legacy, "demo")));
  assert.equal(
    await skillText(join(backup, "repository"), "demo"),
    "repository",
  );

  await migration.rollback();
  assert.equal(await skillText(repository, "demo"), "repository");
  assert.equal(await skillText(legacy, "demo"), "legacy");
});

test("rejects changes after inspection before creating a backup", async () => {
  const root = await createRoot("codexkeep-legacy-preflight-");
  const codexHome = join(root, ".codex");
  const repository = join(root, ".codexkeep", "skills");
  const legacy = join(codexHome, "skills");
  const backup = join(root, "state", "backups", "migration");
  await mkdir(repository, { recursive: true });
  await writeSkill(legacy, "demo", "first");

  const inspection = await inspectLegacySkills(codexHome, repository);
  await writeSkill(legacy, "demo", "changed");

  await assert.rejects(
    async () =>
      await applyLegacySkillMigration(inspection, {}, backup),
    /changed during preflight/u,
  );
  assert.equal(await skillText(legacy, "demo"), "changed");
  await assert.rejects(async () => await access(backup));
});

test("removes an old symlink that already aliases the repository skill", async () => {
  const root = await createRoot("codexkeep-legacy-alias-");
  const codexHome = join(root, ".codex");
  const repository = join(root, ".codexkeep", "skills");
  const legacy = join(codexHome, "skills");
  const backup = join(root, "state", "backups", "migration");
  await writeSkill(repository, "demo", "repository");
  await mkdir(legacy, { recursive: true });
  await symlink(join(repository, "demo"), join(legacy, "demo"));

  const inspection = await inspectLegacySkills(codexHome, repository);
  assert.equal(inspection.entries[0]?.state, "duplicate");

  await applyLegacySkillMigration(inspection, {}, backup);

  assert.equal(await skillText(repository, "demo"), "repository");
  await assert.rejects(async () => await access(join(legacy, "demo")));
  assert.equal(
    await readlink(join(backup, "legacy", "demo")),
    join(repository, "demo"),
  );
});

test("does not keep a repository symlink that depends on the legacy copy", async () => {
  const root = await createRoot("codexkeep-legacy-reverse-alias-");
  const codexHome = join(root, ".codex");
  const repository = join(root, ".codexkeep", "skills");
  const legacy = join(codexHome, "skills");
  const rejectedBackup = join(root, "state", "backups", "rejected");
  const acceptedBackup = join(root, "state", "backups", "accepted");
  await writeSkill(legacy, "demo", "legacy");
  await mkdir(repository, { recursive: true });
  await symlink(join(legacy, "demo"), join(repository, "demo"));

  const inspection = await inspectLegacySkills(codexHome, repository);
  assert.equal(inspection.entries[0]?.state, "conflict");
  await assert.rejects(
    async () =>
      await applyLegacySkillMigration(
        inspection,
        { demo: "repository" },
        rejectedBackup,
      ),
    /机器路径或目录外符号链接/u,
  );
  assert.equal(await skillText(legacy, "demo"), "legacy");
  assert.equal(await readlink(join(repository, "demo")), join(legacy, "demo"));
  await assert.rejects(async () => await access(rejectedBackup));

  const migration = await applyLegacySkillMigration(
    inspection,
    { demo: "legacy" },
    acceptedBackup,
  );
  assert.ok((await lstat(join(repository, "demo"))).isDirectory());
  assert.equal(await skillText(repository, "demo"), "legacy");
  await assert.rejects(async () => await access(join(legacy, "demo")));
  assert.deepEqual(migration.replaced, ["demo"]);
});

test("refuses to import a legacy-only machine-path symlink", async () => {
  const root = await createRoot("codexkeep-legacy-machine-link-");
  const codexHome = join(root, ".codex");
  const repository = join(root, ".codexkeep", "skills");
  const legacy = join(codexHome, "skills");
  const external = join(root, "external", "demo");
  const backup = join(root, "state", "backups", "migration");
  await writeSkill(join(root, "external"), "demo", "external");
  await mkdir(repository, { recursive: true });
  await mkdir(legacy, { recursive: true });
  await symlink(external, join(legacy, "demo"));

  const inspection = await inspectLegacySkills(codexHome, repository);
  assert.equal(inspection.entries[0]?.state, "legacy-only");
  await assert.rejects(
    async () => await applyLegacySkillMigration(inspection, {}, backup),
    /机器路径或目录外符号链接/u,
  );

  assert.equal(await readlink(join(legacy, "demo")), external);
  await assert.rejects(async () => await access(join(repository, "demo")));
  await assert.rejects(async () => await access(backup));
});

test("lists no legacy skills when the old directory is absent", async () => {
  const root = await createRoot("codexkeep-legacy-absent-");
  assert.deepEqual(
    await listLegacySkillNames(join(root, ".codex")),
    [],
  );
});

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function writeSkill(
  root: string,
  name: string,
  content: string,
): Promise<void> {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "SKILL.md"), content);
}

async function skillText(root: string, name: string): Promise<string> {
  return await readFile(join(root, name, "SKILL.md"), "utf8");
}
