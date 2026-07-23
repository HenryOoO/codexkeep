import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { atomicWrite } from "./files.js";

export async function recordTechnicalError(
  path: string,
  error: unknown,
): Promise<void> {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  const redacted = detail
    .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/giu, "$1[redacted]@")
    .replace(
      /(token|secret|password|authorization|api[_-]?key)(\s*[=:]\s*)([^\s]+)/giu,
      "$1$2[redacted]",
    );
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(
    path,
    `${new Date().toISOString()}\n${redacted.slice(0, 20_000)}\n`,
  );
}
