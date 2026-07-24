# npm 发布自动化设计

## 目标

将 CodexKeep 作为不带 scope 的公开 npm 包 `codexkeep` 发布，并把后续发布
收敛为一个本地交互式命令：

```bash
pnpm release
```

本地命令负责准备并发布 GitHub Release。随后，GitHub Actions 工作流验证
Release，并通过 npm Trusted Publishing 发布对应的 npm 包。

## 范围

本次改动将：

- 把包名从 `@henryooo/codexkeep` 改为 `codexkeep`；
- 更新 README 中的安装命令；
- 使用 `bumpp` 交互式选择语义化版本，并统一更新版本号；
- 保证 CLI 显示的版本与 `package.json` 保持一致；
- 增加本地发布编排脚本；
- 增加由 GitHub Release 发布事件触发的 GitHub Actions 工作流；
- 通过 npm Trusted Publishing 和 OIDC 发布，不保存长期 npm 写入令牌；
- 记录首次发布所需的一次性引导流程。

本次改动不包含 changelog 生成、预发布版本发布、monorepo 支持，也不会在普通
提交推送到 `main` 时自动创建 Release。

## 包元数据

`package.json.name` 改为 `codexkeep`，用户通过以下命令安装：

```bash
npm install -g codexkeep
```

现有的 `bin.codexkeep` 映射保持不变。通过 `publishConfig` 明确指定公开 npm
注册表和公开访问级别，降低误发到其他注册表的风险。

首次发布版本仍为 `0.1.0`。后续发布必须使用新的语义化版本，因为 npm 上已经
发布的包版本不可覆盖。

## 本地发布命令

`package.json` 只提供一个发布入口：

```bash
pnpm release
```

该命令运行一个由 `bumpp` 支撑的小型 Node.js 脚本。不增加
`release:patch`、`release:minor` 或 `release:major` 等独立命令。`bumpp`
负责展示交互式版本选项并请求确认。

在修改版本或 Git 状态前，发布脚本必须确认：

1. 当前分支是 `main`；
2. 工作区和暂存区均为干净状态；
3. 完成一次最新的 fetch 后，`origin/main` 存在，且本地分支既不领先也不落后；
4. GitHub CLI 已安装并完成认证；
5. 目标包名是 `codexkeep`；
6. `pnpm check`、`pnpm test` 和 `pnpm build` 全部通过。

预检通过后，`bumpp`：

1. 更新 `package.json.version`；
2. 替换 `src/cli.ts` 中匹配的硬编码版本；
3. 在提交前运行校验钩子，确认两个文件包含相同的新版本；
4. 创建提交 `chore: release vX.Y.Z`；
5. 创建 Git tag `vX.Y.Z`；
6. 将提交和 tag 推送到 `origin`。

`bumpp` 完成后，Node.js 脚本从 `package.json` 读取新版本并运行：

```bash
gh release create vX.Y.Z --verify-tag --generate-notes --title vX.Y.Z
```

GitHub Release 会立即发布，并触发 npm 发布工作流。

如果预检失败，脚本必须在修改版本文件前停止。如果提交和 tag 已推送，但
GitHub Release 创建失败，脚本应输出准确的恢复命令。已经推送的 Release 提交
和 tag 必须保留，用户可以只重试 GitHub Release 创建，无需再次升级版本。

## 版本同步

`bumpp` 配置为同时更新：

- `package.json`；
- `src/cli.ts`。

当前版本字符串必须同时存在于两个文件中。若无法找到或更新 CLI 版本，发布应
在 commit 和 push 之前失败。发布工作流还会独立验证 GitHub Release tag 是否
等于 `v${package.json.version}`。

## GitHub Actions 发布

`.github/workflows/publish.yml` 只响应 `release.published` 事件，并且只处理
非预发布状态的 GitHub Release。

工作流任务依次：

1. checkout Release tag 对应的精确提交；
2. 安装仓库锁定的 pnpm 版本；
3. 配置 Node.js 24 和公开 npm 注册表，并禁用依赖缓存复用；
4. 只授予 `contents: read` 和 `id-token: write` 权限；
5. 使用 `pnpm install --frozen-lockfile` 安装依赖；
6. 验证 Release tag 与 `package.json.version` 匹配；
7. 运行 `pnpm check`、`pnpm test` 和 `pnpm build`；
8. 运行 `npm pack --dry-run` 检查待发布包；
9. 查询完全相同的包版本是否已经存在；
10. 仅在该版本不存在时运行 `npm publish`。

版本存在性检查让工作流重跑和首次发布引导保持幂等。注册表不可用不能被视为
“版本已经发布”；`npm publish` 仍是权威操作，并应在注册表不可用时明确失败。

工作流在 GitHub 托管的 runner 上使用 npm Trusted Publishing，不保存
`NPM_TOKEN`。当仓库和包满足 npm 的公开来源证明条件时，npm 会自动附加
provenance。

## 首次发布引导

npm 不允许给尚未存在的包配置 trusted publisher，因此 `0.1.0` 使用以下一次性
流程：

1. 将发布自动化改动合并并推送到 `main`；
2. 运行完整本地检查和 `npm pack --dry-run`；
3. 通过 npm 2FA 交互式发布 `codexkeep@0.1.0`；
4. 为 npm Trusted Publishing 配置：
   - GitHub 所有者：`HenryOoO`；
   - 仓库：`codexkeep`；
   - 工作流文件名：`publish.yml`；
   - 允许操作：`npm publish`；
5. 从已发布代码对应的提交创建 `v0.1.0` GitHub Release。

第 5 步触发的工作流会完成全部验证，并发现 `codexkeep@0.1.0` 已存在，因此
成功结束而不会重复发布。此后的每个稳定版本只需运行 `pnpm release`。

## 测试

实现阶段必须完成以下验证：

- 对可从真实 Git 和 GitHub 操作中隔离的发布脚本解析逻辑与预检决策编写单元
  测试；
- 通过 dry-run 或命令注入测试证明，测试过程中不会产生真实 commit、tag、
  push、GitHub Release、用户主目录修改或 npm 发布；
- 运行现有的 `pnpm check`、`pnpm test` 和 `pnpm build`；
- 使用 `npm pack --dry-run` 检查包名、版本、可执行文件、README、许可证和
  编译产物；
- 静态检查工作流的触发事件、权限、tag 防护、预发布防护、冻结安装以及 OIDC
  发布步骤。

测试必须使用临时 Git 仓库和临时主目录，绝不能读取或修改真实用户主目录。

## 失败与恢复

- 工作区不干净、分支错误、缺少 remote、`main` 未同步、GitHub 未认证或检查
  失败：在版本升级前停止。
- `bumpp` 更新文件后、push 前失败：保留可恢复的本地状态并输出受影响的路径；
  绝不重置或丢弃用户改动。
- push 成功但 GitHub Release 创建失败：保留已推送的 tag，并输出准确的
  `gh release create` 重试命令。
- GitHub Release 验证失败：不得尝试发布 npm 包。
- npm 上已经存在该版本：报告现状并成功结束。
- npm 发布失败：保留 GitHub Release 和 tag，以便修复认证、trusted
  publisher 配置或注册表可用性后重跑工作流。

## 安全

- 自动发布使用 npm Trusted Publishing 和 OIDC。
- 工作流只获得读取仓库内容和申请 OIDC 身份令牌的权限。
- 不在 GitHub Secrets 中保存 npm 写入令牌。
- 使用 npm 对 GitHub Trusted Publishing 要求的 GitHub 托管 runner。
- 只从版本与 `package.json.version` 匹配的 GitHub Release tag 发布。
- 预发布版本不进入稳定版本发布工作流。
