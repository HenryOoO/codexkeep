<p align="center">
  <strong>简体中文</strong>
  ·
  <a href="https://github.com/HenryOoO/codexkeep/blob/main/README.en.md">English</a>
</p>

<p align="center">
  <img
    src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/codexkeep-banner.svg"
    alt="CodexKeep 在多台 Mac 与用户自己的私有 Git 仓库之间同步可移植的 Codex 配置"
    width="100%"
  />
</p>

<p align="center">
  <a href="#30-秒开始"><img src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/readme-start.svg" alt="开始使用图标" width="16" height="16" /> <strong>30 秒开始</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.md"><img src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/readme-safety.svg" alt="安全与恢复图标" width="16" height="16" /> <strong>安全与恢复</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/HenryOoO/codexkeep/blob/main/docs/commands.md"><img src="https://raw.githubusercontent.com/HenryOoO/codexkeep/main/docs/assets/readme/readme-commands.svg" alt="命令手册图标" width="16" height="16" /> <strong>命令手册</strong></a>
</p>

<h1 align="center">安全同步你的 Codex 配置。</h1>

<p align="center">
  CodexKeep 通过你自己的私有 Git 仓库，在多台 Mac 间同步经过明确筛选的
  Codex 配置；凭据、会话与机器专属内容始终留在本机。
</p>

<p align="center">
  <sub>非官方社区项目，与 OpenAI 没有关联，也未获得 OpenAI 认可。</sub>
</p>

## 30 秒开始

首个版本需要 macOS、Git 和 Node.js 22 或更高版本。先在 GitHub 或其他 Git
服务商创建一个空的私有仓库，然后运行：

```bash
npm install -g codexkeep
codexkeep init git@github.com:your-name/codexkeep-config.git
```

CodexKeep 会发现已有的受支持配置，展示完整初始化计划，确认后建立本地连接并
发布第一份配置。想先只在本机使用，也可以直接运行 `codexkeep init`。

### 在另一台 Mac 上

安装 CodexKeep 后，用同一个仓库再次初始化：

```bash
codexkeep init git@github.com:your-name/codexkeep-config.git
```

新设备使用 `init`，而不是 `link`。CodexKeep 会先在临时目录克隆并验证仓库，
确认安全后才修改本机路径。

### 日常同步

```bash
codexkeep sync
```

一次典型同步只展示准备执行的操作和最终结果：

```text
$ codexkeep sync
将进行以下同步：
  + 保存 1 项本地修改
  + 接收 1 个远程更新
  + 上传 1 个本地更新
✓ 本地配置已保存
✓ 远程仓库已更新
同步完成；所有设备可以使用同一份配置
```

需要先升级第三方 skills 和 plugin marketplaces 时运行 `codexkeep update`；
排查当前设备时运行 `codexkeep check`。直接运行 `codexkeep` 会打开中文交互
菜单。

## 同步边界

| 会同步 | 始终留在本机 |
| --- | --- |
| 个人 skills 与来源记录 | 身份认证、token 和 connector 凭据 |
| 全局 `AGENTS.md` 与自定义 agents | 会话、历史、日志、数据库和缓存 |
| 白名单允许的可移植偏好 | 项目信任与机器专属路径 |
| 经过验证的第三方 plugin 清单 | Codex 内置 skills、plugin bundles 和登录状态 |

三条边界不会因为 `--yes` 而改变：

1. `init` 与 `sync` 在变更受管理配置前完成完整预检并展示计划。
2. 内容冲突必须由你明确选择；CodexKeep 不会猜测。
3. 凭据、会话、缓存和机器专属路径不会进入私有仓库。

查看完整字段、目录结构和恢复策略，请阅读
[安全与恢复指南](https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `codexkeep` | 打开交互菜单 |
| `codexkeep init [git-url]` | 初始化本机或加入已有配置仓库 |
| `codexkeep sync` | 协调本机配置与 Git 远端 |
| `codexkeep update` | 升级第三方来源后同步 |
| `codexkeep check` | 执行只读本机诊断 |
| `codexkeep remote [git-url]` | 查看或连接私人 Git 远端 |
| `codexkeep link` | 恢复本机缺失的配置链接 |

`--yes` 只接受常规确认，不会绕过验证或替你解决内容冲突。参数、网络访问、文件
改动和失败行为见[完整命令手册](https://github.com/HenryOoO/codexkeep/blob/main/docs/commands.md)。

## 常见问题

### 为什么跨设备同步应该使用私有仓库？

仓库不包含凭据和会话，但会保存你的个人 skills、全局 `AGENTS.md`、自定义
agents、白名单偏好和插件清单。纯本地使用不需要远端；跨设备同步时应使用
私有仓库。

### 新设备应该使用 `init` 还是 `link`？

新设备使用 `codexkeep init <git-url>`。只有本机已经存在 `~/.codexkeep`、需要
恢复官方路径符号链接时，才使用 `codexkeep link`。

### 同步失败或发生冲突会丢配置吗？

CodexKeep 不会强制覆盖冲突内容。远端不可用时，本机改动仍可保存；push 失败会
保留本地提交，稍后重新运行 `codexkeep sync` 即可。更多场景见
[安全与恢复指南](https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.md)。

## 文档

- [完整命令手册](https://github.com/HenryOoO/codexkeep/blob/main/docs/commands.md)
- [安全与恢复指南](https://github.com/HenryOoO/codexkeep/blob/main/docs/safety-and-recovery.md)
- [实现说明](https://github.com/HenryOoO/codexkeep/blob/main/docs/IMPLEMENTATION.md)

## 开发

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

测试使用隔离的临时主目录，绝不会读取或修改真实用户配置。

## 许可证

[MIT](https://github.com/HenryOoO/codexkeep/blob/main/LICENSE)
