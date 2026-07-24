#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");

export async function verifyReleaseTag(tag, cwd = defaultRoot) {
  if (!tag) {
    throw new Error("缺少 GitHub Release tag");
  }
  const packageJson = JSON.parse(
    await readFile(resolve(cwd, "package.json"), "utf8"),
  );
  const expected = `v${packageJson.version}`;
  if (tag !== expected) {
    throw new Error(`Release tag 与包版本不一致：预期 ${expected}，实际 ${tag}`);
  }
  return expected;
}

async function main() {
  try {
    const tag = await verifyReleaseTag(process.env.RELEASE_TAG);
    console.log(`Release tag 已验证：${tag}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await main();
}
