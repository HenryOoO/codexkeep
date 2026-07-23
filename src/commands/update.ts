import type { AppContext } from "../app.js";
import {
  updateGlobalSkills,
  upgradeMarketplaces,
} from "../services/codex.js";
import { syncCommand } from "./sync.js";

export async function updateCommand(context: AppContext): Promise<number> {
  const { ui, paths } = context;
  ui.title("CodexKeep Update", "升级第三方来源");
  let failures = 0;

  try {
    await ui.spin("正在升级有来源记录的 skills", async () => {
      await updateGlobalSkills({
        env: context.env,
        signal: context.signal,
        paths,
      });
    });
    ui.success("第三方 skills 已检查");
  } catch {
    ui.warn("部分 skills 未能升级；现有内容没有被删除");
    failures += 1;
  }

  try {
    await ui.spin("正在升级 plugin marketplaces", async () => {
      await upgradeMarketplaces({
        env: context.env,
        signal: context.signal,
        paths,
      });
    });
    ui.success("plugin marketplaces 已检查");
  } catch {
    ui.warn("部分 marketplaces 未能升级；现有内容没有被删除");
    failures += 1;
  }

  const syncResult = await syncCommand(context);
  return failures > 0 || syncResult !== 0 ? 1 : 0;
}
