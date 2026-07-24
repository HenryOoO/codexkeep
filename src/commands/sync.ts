import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { AppContext } from "../app.js";
import {
  emptyInventory,
  inventoryEquals,
  mergeInventories,
  missingInventory,
  parseInventory,
  readInventory,
  writeInventory,
} from "../domain/inventory.js";
import {
  addMarketplace,
  addPlugin,
  collectCodexInventory,
} from "../services/codex.js";
import {
  applyPortableConfig,
  extractPortableConfig,
} from "../services/config.js";
import {
  atomicWrite,
  readTextIfPresent,
} from "../services/files.js";
import {
  aheadBehind,
  commit,
  commitMessage,
  conflictedFiles,
  fetchOrigin,
  hasOrigin,
  isGitRepository,
  mergeBase,
  operationInProgress,
  pullRebase,
  push,
  readFileAtReference,
  rebaseOnto,
  stageAll,
  stagedFiles,
  unstagePath,
  upstreamReference,
  workingChanges,
} from "../services/git.js";
import {
  inspectLinks,
  validateConfigRepository,
} from "../services/links.js";
import { linkSpecs } from "../services/paths.js";

export interface SyncOptions {
  readonly confirmationAlreadySatisfied?: boolean;
  readonly showTitle?: boolean;
}

export async function syncCommand(
  context: AppContext,
  options: SyncOptions = {},
): Promise<number> {
  const { ui, paths } = context;
  if (options.showTitle !== false) {
    ui.title("CodexKeep Sync", "同步个人 Codex 配置");
  }

  const specs = linkSpecs(paths);
  try {
    await validateConfigRepository(specs);
  } catch {
    ui.error("私人配置仓库不完整，未开始同步");
    return 1;
  }
  const links = await inspectLinks(specs);
  if (links.some((entry) => entry.state !== "ready")) {
    ui.error("当前设备尚未完整连接，未开始同步");
    ui.info("运行 codexkeep link 可安全恢复连接");
    return 1;
  }

  const gitOptions = {
    cwd: paths.repo,
    env: context.env,
    signal: context.signal,
  };
  if (!(await isGitRepository(gitOptions))) {
    ui.error("私人配置目录不是 Git 仓库，未开始同步");
    return 1;
  }
  if (
    (await operationInProgress(gitOptions)) ||
    (await conflictedFiles(gitOptions)).length > 0
  ) {
    ui.error("Git 中有尚未完成的冲突，CodexKeep 没有覆盖任何内容");
    return 1;
  }

  const repositoryInventory = await readInventory(
    join(paths.repo, "plugins.json"),
  );
  const profilePath = join(
    paths.repo,
    "codex",
    "codexkeep.config.toml",
  );
  const repositoryPortable = extractPortableConfig(
    (await readTextIfPresent(profilePath)) ?? "",
  );
  const basePortable = extractPortableConfig(
    (await readTextIfPresent(paths.baseConfig)) ?? "",
  );
  let localInventory = emptyInventory();
  let pluginCheckOk = true;
  try {
    localInventory = await ui.spin("正在读取本机插件", async () =>
      await collectCodexInventory({
        env: context.env,
        signal: context.signal,
        paths,
      }),
    );
  } catch {
    pluginCheckOk = false;
    ui.warn("Codex CLI 暂时无法读取插件；文件与 Git 仍会继续同步");
  }

  const remoteConfigured = await hasOrigin(gitOptions);
  let remoteAvailable = false;
  let remoteReference: string | undefined;
  let remoteInventory = emptyInventory();
  let remotePortable: string | undefined;
  let commonPortable = repositoryPortable;

  if (remoteConfigured) {
    try {
      await ui.spin("正在连接 Git 远程仓库", async () => {
        await fetchOrigin(gitOptions);
      });
      remoteAvailable = true;
      remoteReference = await upstreamReference(gitOptions);
      if (remoteReference) {
        const raw = await readFileAtReference(
          remoteReference,
          "plugins.json",
          gitOptions,
        );
        if (raw) remoteInventory = parseInventory(raw);
        const remoteProfile = await readFileAtReference(
          remoteReference,
          "codex/codexkeep.config.toml",
          gitOptions,
        );
        if (remoteProfile !== undefined) {
          remotePortable = extractPortableConfig(remoteProfile);
        }
        const baseReference = await mergeBase(remoteReference, gitOptions);
        const baseProfile = await readFileAtReference(
          baseReference,
          "codex/codexkeep.config.toml",
          gitOptions,
        );
        if (baseProfile !== undefined) {
          commonPortable = extractPortableConfig(baseProfile);
        }
      }
    } catch {
      remoteAvailable = false;
      remoteReference = undefined;
      remotePortable = undefined;
      ui.warn("暂时无法连接远程仓库；本地修改仍可安全保存");
    }
  } else {
    ui.warn("尚未配置远程仓库；本次只保存本地修改");
  }

  let desiredInventory;
  try {
    desiredInventory = mergeInventories(
      repositoryInventory,
      remoteInventory,
      ...(pluginCheckOk ? [localInventory] : []),
    );
  } catch {
    ui.error("同名 marketplace 的来源不一致，未修改任何内容");
    ui.info("请检查 plugins.json 中对应 marketplace 的 source");
    return 1;
  }
  const desiredPortable = await resolvePortableConfig(
    context,
    commonPortable,
    repositoryPortable,
    basePortable,
    remotePortable,
  );
  if (desiredPortable === undefined) {
    ui.cancelled();
    return 0;
  }

  const missing = pluginCheckOk
    ? missingInventory(desiredInventory, localInventory)
    : emptyInventory();
  const changes = await workingChanges(gitOptions);
  const counts = remoteReference
    ? await aheadBehind(remoteReference, gitOptions)
    : { ahead: 0, behind: 0 };
  const needsInitialPush =
    remoteConfigured && remoteAvailable && remoteReference === undefined;
  const inventoryChanged = !inventoryEquals(
    desiredInventory,
    repositoryInventory,
  );
  const repositoryConfigChanged = desiredPortable !== repositoryPortable;
  const baseConfigChanged = desiredPortable !== basePortable;
  const plan = [
    ...missing.marketplaces.map((entry) => `添加 marketplace：${entry.name}`),
    ...missing.plugins.map((entry) => `安装 plugin：${entry}`),
    ...(inventoryChanged ? ["更新插件清单"] : []),
    ...(repositoryConfigChanged ? ["更新可移植 Codex 设置"] : []),
    ...(baseConfigChanged ? ["将可移植设置应用到本机 Codex"] : []),
    ...(changes.length > 0 ? [`保存 ${changes.length} 项本地修改`] : []),
    ...(counts.behind > 0 ? [`接收 ${counts.behind} 个远程更新`] : []),
    ...(counts.ahead > 0 ? [`上传 ${counts.ahead} 个本地更新`] : []),
    ...(needsInitialPush ? ["首次发布私人配置仓库"] : []),
  ];

  if (plan.length === 0) {
    if (!pluginCheckOk) {
      ui.done("文件和 Git 已同步；本次未能核对插件");
      return 1;
    }
    if (remoteConfigured && !remoteAvailable) {
      ui.done("本地没有待保存内容；远程连接尚未确认");
      return 1;
    }
    if (!remoteConfigured) {
      ui.done("本地没有待保存内容；尚未配置远程仓库");
      return 1;
    }
    for (const account of missing.accountPlugins) {
      ui.warn(`${account.name} 需要在插件市场安装或登录`);
    }
    ui.done("已经同步，无需修改");
    return missing.accountPlugins.length > 0 ? 1 : 0;
  }

  ui.line("将进行以下同步：");
  ui.list(plan);
  for (const account of missing.accountPlugins) {
    ui.warn(`${account.name} 需要在插件市场安装或登录`);
  }
  if (
    !options.confirmationAlreadySatisfied &&
    !(await ui.confirm("开始同步？"))
  ) {
    ui.cancelled();
    return 0;
  }

  let pluginFailures = 0;
  if (pluginCheckOk) {
    for (const marketplace of missing.marketplaces) {
      try {
        await ui.spin(`正在添加 marketplace ${marketplace.name}`, async () => {
          await addMarketplace(marketplace.source, {
            env: context.env,
            signal: context.signal,
            paths,
          });
        });
        ui.success(`marketplace ${marketplace.name} 已连接`);
      } catch {
        ui.warn(`marketplace ${marketplace.name} 添加失败`);
        pluginFailures += 1;
      }
    }
    for (const plugin of missing.plugins) {
      try {
        await ui.spin(`正在安装 plugin ${plugin}`, async () => {
          await addPlugin(plugin, {
            env: context.env,
            signal: context.signal,
            paths,
          });
        });
        ui.success(`plugin ${plugin} 已安装`);
      } catch {
        ui.warn(`plugin ${plugin} 安装失败`);
        pluginFailures += 1;
      }
    }
  }

  const originalInventoryRaw = `${JSON.stringify(repositoryInventory, null, 2)}\n`;
  const originalProfileRaw =
    (await readTextIfPresent(profilePath)) ??
    "# Portable Codex preferences managed by CodexKeep.\n";
  await stageAll(gitOptions);
  await unstagePath("plugins.json", gitOptions);
  await unstagePath("codex/codexkeep.config.toml", gitOptions);
  const headInventory = await readFileAtReference("HEAD", "plugins.json", gitOptions);
  const headProfile = await readFileAtReference(
    "HEAD",
    "codex/codexkeep.config.toml",
    gitOptions,
  );
  if (headInventory === undefined) {
    await rm(join(paths.repo, "plugins.json"), { force: true });
  } else {
    await atomicWrite(join(paths.repo, "plugins.json"), headInventory);
  }
  if (headProfile === undefined) {
    await rm(profilePath, { force: true });
  } else {
    await atomicWrite(profilePath, headProfile);
  }

  const firstCommitFiles = await stagedFiles(gitOptions);
  if (firstCommitFiles.length > 0) {
    await commit(commitMessage(firstCommitFiles), gitOptions);
    ui.success("本地配置已保存");
  }

  if (remoteAvailable && remoteReference) {
    try {
      await ui.spin("正在接收远程更新", async () => {
        if (remoteReference === "@{upstream}") {
          await pullRebase(gitOptions);
        } else {
          await rebaseOnto(remoteReference, gitOptions);
        }
      });
    } catch {
      await atomicWrite(
        join(paths.repo, "plugins.json"),
        originalInventoryRaw,
      );
      await atomicWrite(profilePath, originalProfileRaw);
      ui.error("远程更新存在冲突，双方内容都已保留");
      ui.info("CodexKeep 已停止同步，没有强制覆盖任何一方");
      return 1;
    }
  }

  await writeInventory(join(paths.repo, "plugins.json"), desiredInventory);
  await atomicWrite(
    profilePath,
    desiredPortable ||
      "# Portable Codex preferences managed by CodexKeep.\n",
  );
  await stageAll(gitOptions);
  const finalFiles = await stagedFiles(gitOptions);
  if (finalFiles.length > 0) {
    await commit(commitMessage(finalFiles), gitOptions);
    ui.success("同步清单已保存");
  }

  const configBackup = await applyPortableConfig(
    paths.baseConfig,
    paths.state,
    basePortable,
    desiredPortable,
  );
  if (configBackup) {
    ui.success("可移植设置已应用到本机 Codex");
  }

  if (remoteConfigured && remoteAvailable) {
    try {
      await ui.spin("正在上传 Git 更新", async () => {
        await push(gitOptions);
      });
      ui.success("远程仓库已更新");
    } catch {
      ui.error("本地修改已经保存，但暂时无法上传");
      ui.info("没有数据丢失，稍后重新运行 codexkeep sync 即可");
      return 1;
    }
  }

  for (const account of missing.accountPlugins) {
    ui.warn(`${account.name} 需要在插件市场安装或登录`);
  }
  if (pluginFailures > 0 || !pluginCheckOk) {
    ui.done("文件同步完成，但部分插件操作未完成");
    return 1;
  }
  if (!remoteConfigured || !remoteAvailable) {
    ui.done(
      remoteConfigured
        ? "本地配置已保存；远程尚未上传，稍后重新同步即可"
        : "本地配置已保存；连接远程仓库后即可跨设备同步",
    );
    return 1;
  }
  ui.done("同步完成；所有设备可以使用同一份配置");
  return missing.accountPlugins.length > 0 ? 1 : 0;
}

async function resolvePortableConfig(
  context: AppContext,
  common: string,
  repository: string,
  base: string,
  remote: string | undefined,
): Promise<string | undefined> {
  const repositoryChanged = repository !== common;
  const baseChanged = base !== common;
  let local: string;

  if (repositoryChanged && baseChanged && repository !== base) {
    const choice = await context.ui.choose(
      "可移植设置在仓库文件和本机 Codex 中都被修改过",
      [
        { value: "repository", label: "使用仓库文件" },
        { value: "base", label: "使用本机 Codex 设置" },
        { value: "cancel", label: "取消同步" },
      ],
      "cancel",
    );
    if (choice === "cancel") return undefined;
    local = choice === "repository" ? repository : base;
  } else if (repositoryChanged) {
    local = repository;
  } else if (baseChanged) {
    local = base;
  } else {
    local = repository;
  }

  if (remote === undefined || remote === common || remote === local) {
    return local;
  }
  if (local === common) return remote;

  const choice = await context.ui.choose(
    "可移植设置在本机和远程仓库中都被修改过",
    [
      { value: "local", label: "使用本机设置" },
      { value: "remote", label: "使用远程设置" },
      { value: "cancel", label: "取消同步" },
    ],
    "cancel",
  );
  if (choice === "cancel") return undefined;
  return choice === "local" ? local : remote;
}
