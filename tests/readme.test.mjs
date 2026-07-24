import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const englishPath = join(root, "README.md");
const chinesePath = join(root, "README.zh-CN.md");
const bannerPath = join(
  root,
  "docs",
  "assets",
  "readme",
  "codexkeep-banner.svg",
);
const demoPath = join(
  root,
  "docs",
  "assets",
  "readme",
  "codexkeep-demo.gif",
);

const languageLinks = [
  "https://github.com/HenryOoO/codexkeep/blob/main/README.md",
  "https://github.com/HenryOoO/codexkeep/blob/main/README.zh-CN.md",
];
const publicCommands = [
  "codexkeep",
  "codexkeep init",
  "codexkeep sync",
  "codexkeep update",
  "codexkeep check",
  "codexkeep remote",
  "codexkeep link",
];
const sharedSnippets = [
  "npm install -g codexkeep",
  "--yes",
  "pnpm release",
  "```mermaid",
  "https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/codexkeep-banner.svg",
  "https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/codexkeep-demo.gif",
];

test("English and Chinese READMEs expose the same public entry points", async () => {
  const [english, chinese] = await Promise.all([
    readFile(englishPath, "utf8"),
    readFile(chinesePath, "utf8"),
  ]);

  for (const link of languageLinks) {
    assert.match(english, new RegExp(escapeRegExp(link), "u"));
    assert.match(chinese, new RegExp(escapeRegExp(link), "u"));
  }

  for (const command of publicCommands) {
    assert.match(english, new RegExp(escapeRegExp(command), "u"));
    assert.match(chinese, new RegExp(escapeRegExp(command), "u"));
  }

  for (const snippet of sharedSnippets) {
    assert.match(english, new RegExp(escapeRegExp(snippet), "u"));
    assert.match(chinese, new RegExp(escapeRegExp(snippet), "u"));
  }

  for (const marker of [/^## /gmu, /^### /gmu, /<details>/gu, /<summary>/gu]) {
    assert.equal(
      english.match(marker)?.length ?? 0,
      chinese.match(marker)?.length ?? 0,
      `README structure differs for ${marker}`,
    );
  }
});

test("README visual assets stay lightweight", async () => {
  const [banner, demo] = await Promise.all([stat(bannerPath), stat(demoPath)]);

  assert.ok(banner.size < 200 * 1024, "README banner must stay below 200 KB");
  assert.ok(demo.size < 3 * 1024 * 1024, "README demo must stay below 3 MB");
});

test("package files do not opt README visual assets into the npm tarball", async () => {
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );

  assert.ok(Array.isArray(manifest.files));
  assert.ok(
    manifest.files.every((entry) => !entry.includes("docs")),
  );
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
