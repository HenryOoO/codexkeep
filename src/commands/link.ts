import type { AppContext } from "../app.js";
import {
  applyLinks,
  inspectLinks,
  validateConfigRepository,
} from "../services/links.js";
import { linkSpecs } from "../services/paths.js";

export async function linkCommand(context: AppContext): Promise<number> {
  const { ui, paths } = context;
  const specs = linkSpecs(paths);
  ui.title("CodexKeep Link", "连接当前设备");

  try {
    await validateConfigRepository(specs);
  } catch {
    ui.error("私人配置仓库不完整，未创建任何链接");
    ui.info("运行 codexkeep check 可查看缺少的内容");
    return 1;
  }

  const statuses = await inspectLinks(specs);
  const conflicts = statuses.filter((entry) => entry.state === "conflict");
  if (conflicts.length > 0) {
    ui.error("这台设备已有不同配置，未创建任何链接");
    for (const conflict of conflicts) {
      ui.warn(`${conflict.spec.label}：${conflict.spec.target}`);
    }
    ui.info("请使用 codexkeep init 进行一次性安全合并");
    return 1;
  }

  const pending = statuses.filter((entry) => entry.state === "missing");
  if (pending.length === 0) {
    ui.done("当前设备已经连接，无需修改");
    return 0;
  }

  ui.line("将建立以下连接：");
  ui.list(pending.map((entry) => `${entry.spec.label} → ${entry.spec.target}`));
  if (!(await ui.confirm("连接这些配置？"))) {
    ui.cancelled();
    return 0;
  }

  try {
    const result = await applyLinks(specs, paths.state, false);
    for (const target of result.created) ui.success(`已连接 ${target}`);
    ui.done("当前设备已连接");
    return 0;
  } catch {
    ui.error("连接未完成，本次创建的链接已经撤销");
    return 1;
  }
}
