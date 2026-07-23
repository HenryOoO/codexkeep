import {
  copyFile,
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

export async function resolveContentPath(path: string): Promise<string> {
  const stat = await lstat(path);
  return stat.isSymbolicLink() ? await realpath(path) : path;
}

export async function sameSymlink(
  source: string,
  target: string,
): Promise<boolean> {
  try {
    if (!(await lstat(target)).isSymbolicLink()) return false;
    const raw = await readlink(target);
    const resolvedTarget = resolve(dirname(target), raw);
    return resolve(resolvedTarget) === resolve(source);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function atomicWrite(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  await ensureParent(path);
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  await writeFile(temporary, content);
  await rename(temporary, path);
}

export async function readTextIfPresent(
  path: string,
): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

export async function copyPath(source: string, target: string): Promise<void> {
  const stat = await lstat(source);
  await ensureParent(target);
  if (stat.isDirectory()) {
    await cp(source, target, {
      recursive: true,
      dereference: false,
      errorOnExist: false,
      force: false,
      preserveTimestamps: true,
    });
  } else if (stat.isSymbolicLink()) {
    await symlink(await readlink(source), target);
  } else {
    await copyFile(source, target);
  }
}

export async function movePath(source: string, target: string): Promise<void> {
  await ensureParent(target);
  try {
    await rename(source, target);
  } catch (error) {
    if (!isNodeError(error, "EXDEV")) throw error;
    await copyPath(source, target);
    await rm(source, { recursive: true, force: true });
  }
}

export async function fingerprint(path: string): Promise<string> {
  const hash = createHash("sha256");
  await addPathToHash(hash, path, "");
  return hash.digest("hex");
}

async function addPathToHash(
  hash: ReturnType<typeof createHash>,
  path: string,
  relative: string,
): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    hash.update(`link:${relative}:${await readlink(path)}\0`);
    return;
  }
  if (stat.isFile()) {
    hash.update(`file:${relative}\0`);
    const handle = await open(path, "r");
    try {
      for await (const chunk of handle.readableWebStream()) {
        hash.update(Buffer.from(chunk));
      }
    } finally {
      await handle.close();
    }
    return;
  }
  if (!stat.isDirectory()) {
    hash.update(`other:${relative}\0`);
    return;
  }

  const { readdir } = await import("node:fs/promises");
  const entries = (await readdir(path)).filter((name) => name !== ".DS_Store");
  entries.sort();
  hash.update(`dir:${relative}\0`);
  for (const entry of entries) {
    await addPathToHash(hash, join(path, entry), join(relative, entry));
  }
}

export function isNodeError(
  error: unknown,
  code?: string,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (code === undefined || (error as NodeJS.ErrnoException).code === code)
  );
}
