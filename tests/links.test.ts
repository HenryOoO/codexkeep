import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createWorkspaceSkeleton } from "../src/services/workspace.js";
import { applyLinks, inspectLinks } from "../src/services/links.js";
import { createPaths, linkSpecs } from "../src/services/paths.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(
    roots.map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

test("creates all links only after a complete preflight and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-links-"));
  roots.push(root);
  const home = join(root, "home");
  const repo = join(home, ".codexkeep");
  await mkdir(home, { recursive: true });
  await createWorkspaceSkeleton(repo);
  const paths = createPaths({
    HOME: home,
    CODEXKEEP_CONFIG_DIR: repo,
    CODEXKEEP_STATE_DIR: join(root, "state"),
  });
  const specs = linkSpecs(paths);

  const first = await applyLinks(specs, paths.state, false);
  assert.equal(first.created.length, 5);
  assert.ok((await inspectLinks(specs)).every((entry) => entry.state === "ready"));

  const second = await applyLinks(specs, paths.state, false);
  assert.deepEqual(second.created, []);
});

test("refuses every link when one target contains unmanaged content", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-conflict-"));
  roots.push(root);
  const home = join(root, "home");
  const repo = join(home, ".codexkeep");
  await createWorkspaceSkeleton(repo);
  await mkdir(join(home, ".agents", "skills"), { recursive: true });
  await writeFile(join(home, ".agents", "skills", "existing.txt"), "keep");
  const paths = createPaths({
    HOME: home,
    CODEXKEEP_CONFIG_DIR: repo,
    CODEXKEEP_STATE_DIR: join(root, "state"),
  });
  const specs = linkSpecs(paths);

  await assert.rejects(
    async () => await applyLinks(specs, paths.state, false),
    /Existing content/u,
  );
  assert.equal(await readFile(join(home, ".agents", "skills", "existing.txt"), "utf8"), "keep");
  assert.equal((await inspectLinks(specs)).filter((entry) => entry.state === "ready").length, 0);
});

test("adopts existing content into a recoverable backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-adopt-"));
  roots.push(root);
  const home = join(root, "home");
  const repo = join(home, ".codexkeep");
  await createWorkspaceSkeleton(repo);
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(join(home, ".codex", "AGENTS.md"), "old instructions");
  const paths = createPaths({
    HOME: home,
    CODEXKEEP_CONFIG_DIR: repo,
    CODEXKEEP_STATE_DIR: join(root, "state"),
  });

  const result = await applyLinks(linkSpecs(paths), paths.state, true);
  assert.ok(result.backupDir);
  assert.equal(
    await readFile(join(result.backupDir!, "AGENTS.md-1"), "utf8"),
    "old instructions",
  );
});
