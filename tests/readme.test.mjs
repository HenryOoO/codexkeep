import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chinesePath = join(root, "README.md");
const englishPath = join(root, "README.en.md");
const legacyChinesePath = join(root, "README.zh-CN.md");
const commandsChinesePath = join(root, "docs", "commands.md");
const commandsEnglishPath = join(root, "docs", "commands.en.md");
const safetyChinesePath = join(root, "docs", "safety-and-recovery.md");
const safetyEnglishPath = join(
  root,
  "docs",
  "safety-and-recovery.en.md",
);
const bannerPath = join(
  root,
  "docs",
  "assets",
  "readme",
  "codexkeep-banner.svg",
);
const readmeIconNames = [
  "readme-start.svg",
  "readme-safety.svg",
  "readme-commands.svg",
];
const readmeIconPaths = readmeIconNames.map((name) =>
  join(root, "docs", "assets", "readme", name),
);

const readmes = [
  ["Chinese", chinesePath],
  ["English", englishPath],
];
const commandGuides = [
  ["Chinese", commandsChinesePath],
  ["English", commandsEnglishPath],
];
const safetyGuides = [
  ["Chinese", safetyChinesePath],
  ["English", safetyEnglishPath],
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
const bannerUrl =
  "https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/codexkeep-banner.svg";
const readmeIconUrls = readmeIconNames.map(
  (name) =>
    `https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/${name}`,
);

test("README.md is the concise Chinese default with a complete English peer", async () => {
  const [chinese, english] = await Promise.all([
    readFile(chinesePath, "utf8"),
    readFile(englishPath, "utf8"),
  ]);

  assert.match(chinese, /安全同步你的 Codex 配置/u);
  assert.match(english, /Sync your Codex configuration safely/u);
  assert.match(
    chinese,
    /https:\/\/github\.com\/HenryOoO\/codexkeep\/blob\/main\/README\.en\.md/u,
  );
  assert.match(
    english,
    /https:\/\/github\.com\/HenryOoO\/codexkeep\/blob\/main\/README\.md/u,
  );
  assert.ok(
    chinese.split("\n").length <= 220,
    "Chinese README should remain product-focused",
  );
  assert.ok(
    english.split("\n").length <= 220,
    "English README should remain product-focused",
  );

  for (const command of publicCommands) {
    assert.match(chinese, new RegExp(escapeRegExp(command), "u"));
    assert.match(english, new RegExp(escapeRegExp(command), "u"));
  }

  for (const snippet of [
    "npm install -g codexkeep",
    "--yes",
    bannerUrl,
    ...readmeIconUrls,
  ]) {
    assert.match(chinese, new RegExp(escapeRegExp(snippet), "u"));
    assert.match(english, new RegExp(escapeRegExp(snippet), "u"));
  }

  for (const marker of [/^## /gmu, /^### /gmu]) {
    assert.equal(
      chinese.match(marker)?.length ?? 0,
      english.match(marker)?.length ?? 0,
      `README structure differs for ${marker}`,
    );
  }

  for (const source of [chinese, english]) {
    assert.doesNotMatch(source, /img\.shields\.io/u);
    assert.doesNotMatch(source, /```mermaid/u);
    assert.doesNotMatch(source, /^> .*OpenAI/gmu);
  }

  assert.match(chinese, /<sub>非官方社区项目/u);
  assert.match(english, /<sub>Unofficial community project/u);
});

test("legacy Chinese README points readers to the new default", async () => {
  const legacy = await readFile(legacyChinesePath, "utf8");

  assert.match(
    legacy,
    /https:\/\/github\.com\/HenryOoO\/codexkeep\/blob\/main\/README\.md/u,
  );
  assert.match(
    legacy,
    /https:\/\/github\.com\/HenryOoO\/codexkeep\/blob\/main\/README\.en\.md/u,
  );
  assert.ok(
    legacy.split("\n").length <= 12,
    "legacy README should not duplicate the Chinese documentation",
  );
});

test("paired command guides cover every public command and global option", async () => {
  const guides = await Promise.all(
    commandGuides.map(async ([language, path]) => [
      language,
      await readFile(path, "utf8"),
    ]),
  );

  for (const [language, guide] of guides) {
    for (const command of publicCommands) {
      assert.match(
        guide,
        new RegExp(escapeRegExp(command), "u"),
        `${language} command guide is missing ${command}`,
      );
    }
    for (const option of ["--yes", "--help", "--version"]) {
      assert.match(
        guide,
        new RegExp(escapeRegExp(option), "u"),
        `${language} command guide is missing ${option}`,
      );
    }
  }
});

test("paired safety guides preserve scope, links, backups, and recovery", async () => {
  const guides = await Promise.all(
    safetyGuides.map(async ([language, path]) => [
      language,
      await readFile(path, "utf8"),
    ]),
  );

  for (const [language, guide] of guides) {
    for (const fact of [
      "~/.codexkeep",
      "~/.local/state/codexkeep",
      "~/.codex/config.toml",
      "model_reasoning_effort",
      "codexkeep check",
      "codexkeep sync",
      "--yes",
    ]) {
      assert.match(
        guide,
        new RegExp(escapeRegExp(fact), "u"),
        `${language} safety guide is missing ${fact}`,
      );
    }
  }
});

test("README documents link to their language peers and detailed guides", async () => {
  const files = await Promise.all(
    [
      ...readmes,
      ...commandGuides,
      ...safetyGuides,
    ].map(async ([language, path]) => [
      language,
      path,
      await readFile(path, "utf8"),
    ]),
  );
  const combined = files.map(([, , content]) => content).join("\n");

  for (const path of [
    "README.en.md",
    "docs/commands.md",
    "docs/commands.en.md",
    "docs/safety-and-recovery.md",
    "docs/safety-and-recovery.en.md",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(path), "u"));
  }

  assert.doesNotMatch(combined, /codexkeep-demo\.gif/u);
  assert.doesNotMatch(combined, /\/Users\/|avengerwe@/u);
});

test("README visual assets stay lightweight and product-focused", async () => {
  const [banner, source] = await Promise.all([
    stat(bannerPath),
    readFile(bannerPath, "utf8"),
  ]);

  assert.ok(banner.size < 100 * 1024, "README banner must stay below 100 KB");
  assert.match(source, /<title id="title">CodexKeep<\/title>/u);
  assert.match(source, /CONTROL ROUTE/u);
  assert.match(source, /PREFLIGHT READY/u);
  assert.match(source, /LOCAL ONLY/u);
  assert.doesNotMatch(
    source,
    /Your Codex world|across every machine|PRIVATE SYNC TOPOLOGY/u,
  );

  const icons = await Promise.all(
    readmeIconPaths.map(async (path) => ({
      metadata: await stat(path),
      source: await readFile(path, "utf8"),
    })),
  );

  for (const icon of icons) {
    assert.ok(icon.metadata.size < 2 * 1024, "README icon must stay below 2 KB");
    assert.match(icon.source, /<title>[^<]+<\/title>/u);
    assert.match(icon.source, /viewBox="0 0 20 20"/u);
  }
});

test("package files keep visual and detailed docs out of the npm tarball", async () => {
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );

  assert.ok(Array.isArray(manifest.files));
  assert.ok(manifest.files.every((entry) => !entry.includes("docs")));
  assert.ok(manifest.files.includes("README.md"));
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
