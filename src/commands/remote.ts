import type { AppContext } from "../app.js";
import {
  addOrigin,
  conflictedFiles,
  isGitRepository,
  operationInProgress,
  originUrl,
  probeRemote,
  setOrigin,
} from "../services/git.js";
import {
  inspectLinks,
  validateConfigRepository,
} from "../services/links.js";
import { linkSpecs } from "../services/paths.js";
import { syncCommand } from "./sync.js";

export async function remoteCommand(
  context: AppContext,
  remote?: string,
): Promise<number> {
  const { ui, paths } = context;
  ui.title("CodexKeep Remote", remote ? "连接私人仓库" : "查看私人仓库");

  const specs = linkSpecs(paths);
  try {
    await validateConfigRepository(specs);
  } catch {
    ui.error("尚未初始化 CodexKeep");
    ui.info("请先运行 codexkeep init");
    return 1;
  }

  const gitOptions = {
    cwd: paths.repo,
    env: context.env,
    signal: context.signal,
  };
  if (!(await isGitRepository(gitOptions))) {
    ui.error("私人配置目录不是 Git 仓库");
    return 1;
  }

  const current = await originUrl(gitOptions);
  if (!remote) {
    ui.done(current ? `当前远程仓库：${current}` : "当前仅保存在本机");
    return 0;
  }
  if (current === remote) {
    ui.done("这个远程仓库已经连接，无需修改");
    return 0;
  }

  const links = await inspectLinks(specs);
  if (links.some((entry) => entry.state !== "ready")) {
    ui.error("当前设备尚未完整连接，远程仓库没有修改");
    ui.info("运行 codexkeep link 可安全恢复连接");
    return 1;
  }
  if (
    (await operationInProgress(gitOptions)) ||
    (await conflictedFiles(gitOptions)).length > 0
  ) {
    ui.error("Git 中有尚未完成的冲突，远程仓库没有修改");
    return 1;
  }

  let state: "empty" | "populated";
  try {
    state = await ui.spin("正在检查远程仓库", async () =>
      await probeRemote(remote, context.env, context.signal),
    );
  } catch {
    ui.error("无法连接这个 Git 仓库，远程仓库没有修改");
    ui.info("请确认地址、访问权限和网络连接");
    return 1;
  }
  if (state === "populated") {
    ui.error("这个远程仓库已有内容，未连接到当前配置");
    ui.info("已有 CodexKeep 仓库应在新设备上使用 codexkeep init <git-url>");
    return 1;
  }

  ui.line("将进行以下操作：");
  ui.list([
    current ? "更换私人 Git 仓库" : "连接私人 Git 仓库",
    "发布当前 CodexKeep 配置",
  ]);
  if (!(await ui.confirm("连接并同步？"))) {
    ui.cancelled();
    return 0;
  }

  if (current) {
    await setOrigin(remote, gitOptions);
  } else {
    await addOrigin(remote, gitOptions);
  }
  ui.success("远程仓库已连接");

  return await syncCommand(context, {
    confirmationAlreadySatisfied: true,
    showTitle: false,
  });
}
