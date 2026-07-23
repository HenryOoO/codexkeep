import { join } from "node:path";

export interface CodexKeepPaths {
  readonly home: string;
  readonly repo: string;
  readonly state: string;
  readonly agentsHome: string;
  readonly codexHome: string;
  readonly baseConfig: string;
  readonly legacyRepo: string;
  readonly lastError: string;
}

export interface LinkSpec {
  readonly label: string;
  readonly source: string;
  readonly target: string;
}

export function createPaths(env: NodeJS.ProcessEnv): CodexKeepPaths {
  const home = env.HOME;
  if (!home) {
    throw new Error("HOME is not set.");
  }

  const codexHome = env.CODEX_HOME ?? join(home, ".codex");
  const agentsHome = env.CODEXKEEP_AGENTS_HOME ?? join(home, ".agents");
  const stateRoot =
    env.CODEXKEEP_STATE_DIR ??
    join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), "codexkeep");

  return {
    home,
    repo: env.CODEXKEEP_CONFIG_DIR ?? join(home, ".codexkeep"),
    state: stateRoot,
    agentsHome,
    codexHome,
    baseConfig: join(codexHome, "config.toml"),
    legacyRepo: env.MYCODEX_HOME ?? join(home, ".mycodex"),
    lastError: join(stateRoot, "last-error.log"),
  };
}

export function linkSpecs(paths: CodexKeepPaths): LinkSpec[] {
  return [
    {
      label: "个人 skills",
      source: join(paths.repo, "skills"),
      target: join(paths.agentsHome, "skills"),
    },
    {
      label: "skills 来源记录",
      source: join(paths.repo, "skill-lock.json"),
      target: join(paths.agentsHome, ".skill-lock.json"),
    },
    {
      label: "全局 AGENTS.md",
      source: join(paths.repo, "codex", "AGENTS.md"),
      target: join(paths.codexHome, "AGENTS.md"),
    },
    {
      label: "自定义 agents",
      source: join(paths.repo, "codex", "agents"),
      target: join(paths.codexHome, "agents"),
    },
    {
      label: "CodexKeep profile",
      source: join(paths.repo, "codex", "codexkeep.config.toml"),
      target: join(paths.codexHome, "codexkeep.config.toml"),
    },
  ];
}
