import type { Ui } from "./ui/index.js";
import type { CodexKeepPaths } from "./services/paths.js";

export interface AppContext {
  readonly paths: CodexKeepPaths;
  readonly ui: Ui;
  readonly assumeYes: boolean;
  readonly signal: AbortSignal;
  readonly env: NodeJS.ProcessEnv;
}

export class UserError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}
