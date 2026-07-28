# CodexKeep README 产品定位与视觉调优设计

日期：2026-07-28

## 背景

当前未提交的 README 重构已经完成了中文默认入口、双语主文档、精简命令说明、
安全恢复指南和新版横幅等基础工作。本轮不推翻这些改动，而是在其上修正产品
定位与首屏视觉层级。

现有首屏使用 npm 版本、Node.js 要求和许可证三枚 Shields 徽章。它们描述的是
发布与运行时元数据，容易让 CodexKeep 看起来像开发框架、库或脚手架，无法
表达用户选择它的真正原因。

本轮确认的产品定位是：

> CodexKeep 是面向个人 Codex 用户的安全配置同步工具。它通过用户自己的私有
> Git 仓库协调多台 Mac 上的可移植配置，同时把凭据、会话和机器专属内容留在
> 本机。

## 目标

- 让 README 第一眼呈现“安全同步工具”，而不是“Node.js 项目”。
- 用精密、可观察的系统工具气质表达预检、隔离和可恢复写入。
- 删除 npm、Node.js 和 License 首屏徽章。
- 使用本地化品牌横幅和轻量图标导航建立产品仓库的视觉层级。
- 避免“大标题 + 三张等宽卖点卡”等模板化、AI 营销页式结构。
- 让用户在首屏内理解用途、关键边界并进入安装步骤。
- 保持中英文 README 的事实与章节结构一致。
- 保留当前未提交重构中已经完成的详细文档迁移和兼容入口。

## 非目标

- 不改变 CLI 行为、同步范围或安全策略。
- 不新增网站、社区入口、演示环境或下载渠道。
- 不把 GitHub stars、下载量、构建状态等尚未承担用户决策价值的指标放入首屏。
- 不把 README 扩展成完整命令手册或实现文档。
- 不恢复已经从 README 移除的终端 GIF。
- 不使用生成式位图作为最终仓库资产。

## 参考结论

本轮对照了以下成熟产品仓库的 README：

- Plane：品牌 Logo、产品承诺、导航和大幅产品截图主导首屏；Docker 与
  Kubernetes 徽章只出现在安装章节。
- Twenty：使用自有图标、文字导航和明暗主题封面，不在首屏堆放 Shields
  元数据。
- Ghostty：使用品牌 Logo、精确的产品承诺和文本入口，不使用首屏徽章。
- Immich：只保留少量大号 License 与 Discord 徽章，Logo 和产品截图仍是视觉
  主体。
- Memos：徽章承担 Home、Demo、Docs、Discord 等用户行动，而不是展示运行时
  版本。

这些案例的共同点不是某一种徽章样式，而是品牌资产优先；徽章如果存在，也应
承担用户入口、社区或真实信任信号。CodexKeep 当前没有网站、Demo 或社区入口，
因此采用自有图标导航比放大 Shields 徽章更诚实、更符合产品阶段。

参考：

- https://github.com/makeplane/plane
- https://github.com/twentyhq/twenty
- https://github.com/ghostty-org/ghostty
- https://github.com/immich-app/immich
- https://github.com/usememos/memos

## 首屏设计

首屏使用以下固定顺序：

1. 语言切换；
2. 全宽品牌横幅；
3. 图标导航；
4. 一句核心承诺与一段产品说明；
5. 低对比度非官方归属说明；
6. `30 秒开始`。

不在核心承诺与安装步骤之间加入“为什么选择”标题、三列卖点卡或重复的流程图。

### 品牌横幅

横幅继续使用轻量 SVG，并保持暗色精密控制台方向。中文与英文分别使用
`codexkeep-banner.svg` 和 `codexkeep-banner.en.svg`；两张图共享构图、图形、
尺寸和色彩，仅替换承担语义的界面标签与替代文本。

- 左侧展示 `CodexKeep` 品牌名，以及个人 skills、全局 `AGENTS.md`、自定义
  agents、白名单偏好和已验证插件清单；
- 右侧使用“本机 → 预检 → Git → 另一台 Mac”路由表达同步；
- 预检节点使用绿色状态信号，形成视觉焦点；
- 凭据、会话和机器路径使用独立通道表达，中文标记为“仅限本机”，英文标记为
  `Local only`；
- 使用低对比网格、克制的紫色与绿色光晕，以及小型状态读数；
- 不使用盾牌、锁、保险库等常见安全产品陈词滥调；
- 横幅即使加载失败，紧邻的 Markdown 文案也必须独立表达完整用途；
- 保持无脚本、可编辑、体积小于 100 KB，并提供准确的 SVG title、desc 和图片
  alt。

中文横幅使用“Codex 配置同步”“同步路径”“预检就绪”“本机”“预检”“另一台
Mac”“仅限本机”等中文标签。英文横幅使用对应的自然英文。`CodexKeep`、
`skills`、`AGENTS.md`、`agents`、`Git` 和 `Mac` 等产品名、文件名或通用专名
保留原样，不强行翻译。

最终横幅尺寸沿用当前适合 README 的横向比例；实现时允许在当前
`1600 × 420` 画布内调整构图，不为追求更高画布而增加首屏高度。

### 图标导航

删除三枚 Shields 徽章，替换为居中的三个轻量文本入口：

- `30 秒开始` / `30-second start`：跳转到当前 README 的安装章节；
- `安全与恢复` / `Safety & recovery`：链接对应语言的安全恢复指南；
- `命令手册` / `Command guide`：链接对应语言的命令手册。

每个入口使用一个 `16 × 16` 左右的自有 SVG 图标。三个图标共享圆角方形语言，
分别使用绿色、紫色和蓝色强调色。它们是导航图标，不模拟构建状态、版本或产品
认证，也不使用 Shields.io。

图标资产分别命名为 `readme-start.svg`、`readme-safety.svg` 和
`readme-commands.svg`，放在 `docs/assets/readme/`。README 通过 GitHub raw
绝对地址引用，以保证 GitHub 与 npm README 页面都能显示。图标必须具有准确
alt，链接文本本身仍提供完整含义。

### 核心文案

中文首屏核心承诺为：

> 安全同步你的 Codex 配置。

中文说明文字固定为：

> CodexKeep 通过你自己的私有 Git 仓库，在多台 Mac 间同步经过明确筛选的
> Codex 配置；凭据、会话与机器专属内容始终留在本机。

具体同步对象不在首屏使用 `instructions`、`agents` 或“偏好”等无边界统称，
而由后续“同步边界”表明确列出：

- `~/.agents/skills` 中的个人 skills 与来源记录；
- 全局 `~/.codex/AGENTS.md`；
- `~/.codex/agents` 中的自定义 agents；
- 字段白名单、布尔 features、清理后的 skills 配置和使用安全相对路径的 agents
  配置；
- 经过验证的第三方 marketplace 与 plugin 清单。

英文说明文字固定为：

> CodexKeep uses your own private Git repository to synchronize a deliberately
> selected set of Codex configuration across Macs; credentials, sessions, and
> machine-specific content always stay local.

英文不能把 `global AGENTS.md` 扩大为所有 instructions，或把 allowlisted
preferences 扩大为全部 preferences。两种语言都不使用“无忧”“智能”“零风险”
等无法验证的营销词。

### 非官方归属说明

保留与 OpenAI 无关联、未获得认可的说明，但不再使用引用块、警告框或灰底
高亮。它使用一行居中的低对比度脚注，位于产品说明之后、安装章节之前。

该说明的目的仅是避免归属混淆，不与产品承诺争夺视觉注意力。

## README 后半段结构

主 README 继续保持产品导向，并按“使用 → 边界 → 参考”组织。

### 30 秒开始

按实际使用顺序保留：

1. 第一台 Mac 的安装和 `init`；
2. 另一台 Mac 使用同一仓库执行 `init`；
3. 日常 `sync` 命令和一段真实、稳定的输出。

Node.js 22、macOS 和 Git 要求在安装正文中说明，不再提升为首屏徽章。npm 只
作为实际安装命令出现，不展示包版本或 npm 品牌状态。

### 同步边界

保留“会同步 / 始终留在本机”的双列表格，让用户用具体内容判断是否适合自己。

横幅已经表达同步路径，因此删除主 README 中重复的 Mermaid 流程图。同步实现、
目录结构、字段白名单和恢复细节继续放在安全恢复指南中。

### 安全模型

使用编号列表说明三个可验证行为：

1. 变更受管理配置前完成预检并展示计划；
2. 内容冲突必须由用户明确选择，`--yes` 不会自动选边；
3. 关键文件写入保留恢复路径，凭据、会话、缓存和机器专属路径不会进入仓库。

不将这些内容包装为等宽卖点卡，也不增加泛化营销标题。

### 命令与参考

保留简短命令表，覆盖全部公共命令：

- `codexkeep`
- `codexkeep init [git-url]`
- `codexkeep sync`
- `codexkeep update`
- `codexkeep check`
- `codexkeep remote [git-url]`
- `codexkeep link`

每行只说明用途。参数、网络访问、冲突和恢复行为链接到对应语言的命令手册与
安全恢复指南。

README 尾部顺序为：

1. 常见问题；
2. 文档；
3. 开发；
4. 许可证。

FAQ 只保留影响用户决策的问题，不重复命令手册。

## 双语与兼容

- `README.md` 继续作为简体中文默认文档。
- `README.en.md` 保持相同章节数、入口、命令和安全事实。
- `README.zh-CN.md` 继续作为旧链接兼容入口，不复制完整内容。
- 中文与英文可使用自然表达，但不能出现不同的能力承诺。
- 主 README 中跳转到详细文档的链接继续使用 GitHub 绝对地址，以兼容 npm
  README 渲染。
- 三个导航图标继续共用语言无关的图形；横幅因包含有意义的状态与路径标签而
  分为中英文两份，不再把英文技术标签视为语言中立。

## 资产变化

实现会修改或新增：

- `docs/assets/readme/codexkeep-banner.svg`
- `docs/assets/readme/codexkeep-banner.en.svg`
- 三个位于 `docs/assets/readme/` 的导航图标 SVG
- `README.md`
- `README.en.md`
- `tests/readme.test.mjs`

实现不恢复 `docs/assets/readme/codexkeep-demo.gif`，也不改动详细命令手册、
安全恢复指南或兼容 README，除非校验发现现有链接与新入口不一致。

## 验收标准

自动校验需要覆盖：

- 两份主 README 不再引用 `img.shields.io`；
- 两份主 README 不再出现 npm 版本、Node.js 或 License 首屏徽章；
- 三个图标导航入口在两种语言中均存在，并指向正确章节或对应语言文档；
- 中文 README 只引用中文横幅，英文 README 只引用英文横幅；
- 中文横幅不包含 `PREFLIGHT READY`、`LOCAL ONLY` 等英文界面标签；
- 两张横幅的画布、节点数量、视觉结构和安全边界保持对应；
- 两份主 README 仍覆盖全部公共命令；
- 两份主 README 的章节结构与 Mermaid 数量一致；
- 主 README 不再包含 Mermaid 同步图；
- 非官方归属说明仍存在，但不使用 Markdown 引用块或 GitHub 警告块；
- 横幅与三个图标存在、SVG 可解析且总尺寸受控；
- README 不包含真实用户主目录、凭据或私有远程地址；
- `README.zh-CN.md` 兼容入口继续有效。

实现完成后运行：

```bash
pnpm check
pnpm test
pnpm build
npm pack --dry-run
git diff --check
```

人工验收需要在 GitHub 风格的浅色和深色背景下检查：

- 横幅文字和路由节点清晰；
- 图标导航不被误读为状态徽章；
- 非官方归属说明可读但不抢焦点；
- 首屏在常见桌面宽度下能进入 `30 秒开始`；
- 中文与英文文案换行自然；
- 删除三列营销卡后，README 没有出现突兀的大段空白。

## 实施约束

- 保留当前工作树中已有的 README 双语重构，不回退用户改动。
- 实现前先核对现有差异，按文件和区域增量修改。
- 不新增运行时或开发依赖。
- 所有视觉资产使用仓库内 SVG，避免外部徽章服务成为渲染依赖。
- 文档与资产改动不改变 npm 包的 `files` 范围；docs 仍不进入发布包。
