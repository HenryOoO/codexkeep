import { spawn } from "node:child_process";

export interface ProcessOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly allowFailure?: boolean;
}

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export class ProcessError extends Error {
  constructor(
    readonly command: string,
    readonly args: readonly string[],
    readonly result: ProcessResult,
  ) {
    super(
      `${command} exited with code ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim()}`,
    );
    this.name = "ProcessError";
  }
}

export async function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: options.signal,
    });

    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);

    const finish = (error?: Error, exitCode = 1): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);

      const result = { stdout, stderr, exitCode };
      if (error) {
        reject(error);
      } else if (exitCode !== 0 && !options.allowFailure) {
        reject(new ProcessError(command, args, result));
      } else {
        resolve(result);
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 4_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 4_000_000) child.kill("SIGTERM");
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code, signal) => {
      const exitCode = code ?? (signal === "SIGTERM" ? 124 : 1);
      finish(undefined, exitCode);
    });
  });
}
