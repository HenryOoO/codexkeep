import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppContext } from "../app.js";
import {
  applyPortableConfig,
  extractPortableConfig,
} from "../services/config.js";
import {
  atomicWrite,
  movePath,
  pathExists,
  readTextIfPresent,
} from "../services/files.js";
import {
  cloneRepository,
  commit,
  initializeRepository,
  stageAll,
  stagedFiles,
} from "../services/git.js";
import {
  applyLinks,
  inspectLinks,
  validateConfigRepository,
} from "../services/links.js";
import { linkSpecs } from "../services/paths.js";
import {
  createWorkspaceSkeleton,
  importLocalConfiguration,
} from "../services/workspace.js";

export async function initCommand(
  context: AppContext,
  remote?: string,
): Promise<number> {
  const { ui, paths } = context;
  ui.title("CodexKeep Init", remote ? "连接私人仓库" : "初始化私人仓库");

  if (await pathExists(paths.repo)) {
    ui.error(`${paths.repo} 已经存在`);
    ui.info("如需重新连接当前设备，请运行 codexkeep link");
    return 1;
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "codexkeep-init-"));
  const workspace = join(temporaryRoot, "config");

  try {
    if (remote) {
      await ui.spin("正在验证私人 Git 仓库", async () => {
        await cloneRepository(remote, workspace, context.env, context.signal);
      });
      await validateConfigRepository(linkSpecs({ ...paths, repo: workspace }));
    } else {
      await createWorkspaceSkeleton(workspace);
      await initializeRepository(workspace, context.env, context.signal);
    }

    const imported = await ui.spin("正在发现本机 Codex 配置", async () =>
      await importLocalConfiguration(workspace, context, remote !== undefined),
    );

    const temporarySpecs = linkSpecs({ ...paths, repo: workspace });
    await validateConfigRepository(temporarySpecs);
    const finalSpecs = linkSpecs(paths);
    const linkStatus = await inspectLinks(temporarySpecs);
    const adopted = linkStatus.filter((entry) => entry.state === "conflict");
    const missing = linkStatus.filter((entry) => entry.state === "missing");

    const basePortable = extractPortableConfig(
      (await readTextIfPresent(paths.baseConfig)) ?? "",
    );
    const desiredPortable = extractPortableConfig(
      (await readTextIfPresent(
        join(workspace, "codex", "codexkeep.config.toml"),
      )) ?? "",
    );

    const plan = [
      remote ? "使用已验证的私人 Git 仓库" : "创建本地私人 Git 仓库",
      ...imported.actions,
      ...(adopted.length > 0
        ? [`备份并接管 ${adopted.length} 项现有官方路径`]
        : []),
      ...(missing.length > 0
        ? [`建立 ${missing.length} 项官方路径连接`]
        : []),
      ...(basePortable === desiredPortable
        ? []
        : ["将仓库中的可移植设置应用到 Codex config.toml"]),
    ];

    ui.line("将进行以下初始化：");
    ui.list(plan);
    for (const warning of imported.warnings) ui.warn(warning);
    if (!(await ui.confirm("开始初始化？"))) {
      ui.cancelled();
      return 0;
    }

    await stageAll({
      cwd: workspace,
      env: context.env,
      signal: context.signal,
    });
    const staged = await stagedFiles({
      cwd: workspace,
      env: context.env,
      signal: context.signal,
    });
    if (staged.length > 0) {
      try {
        await commit(
          remote ? "chore: import local Codex config" : "chore: initialize CodexKeep",
          {
            cwd: workspace,
            env: context.env,
            signal: context.signal,
          },
        );
      } catch {
        ui.warn("Git 尚未提交；配置会保留，设置 Git 身份后运行 codexkeep sync");
      }
    }

    await movePath(workspace, paths.repo);
    let configBackup: string | undefined;
    const baseConfigExisted = await pathExists(paths.baseConfig);
    try {
      configBackup = await applyPortableConfig(
        paths.baseConfig,
        paths.state,
        basePortable,
        desiredPortable,
      );
      const linked = await applyLinks(finalSpecs, paths.state, true);
      for (const target of linked.created) ui.success(`已连接 ${target}`);
      if (linked.backupDir) {
        ui.info(`原配置已备份到 ${linked.backupDir}`);
      }
    } catch (error) {
      if (configBackup) {
        const original = await readFile(configBackup);
        if (baseConfigExisted) {
          await atomicWrite(paths.baseConfig, original);
        } else {
          await rm(paths.baseConfig, { force: true });
        }
      }
      const recovery = join(
        paths.state,
        `failed-init-${new Date().toISOString().replaceAll(":", "-")}`,
      );
      await movePath(paths.repo, recovery);
      ui.error("初始化未完成，原配置已经恢复");
      ui.info(`新仓库内容保存在 ${recovery}`);
      return 1;
    }

    ui.done(
      remote
        ? "初始化完成；运行 codexkeep sync 可同步后续修改"
        : "初始化完成；添加私人 Git remote 后运行 codexkeep sync",
    );
    return 0;
  } catch (error) {
    if (error instanceof Error && /cancelled/iu.test(error.message)) {
      ui.cancelled();
      return 0;
    }
    ui.error("初始化未开始，本机原配置没有变化");
    ui.info("运行 codexkeep check 可查看本机状态");
    return 1;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
