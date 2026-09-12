# dsh-universal-palette

[![npm version](https://img.shields.io/npm/v/@yunmin311/dsh-universal-palette.svg)](https://www.npmjs.com/package/@yunmin311/dsh-universal-palette)
[![GitHub release](https://img.shields.io/github/v/release/yunmin311/dsh-universal-palette.svg)](https://github.com/yunmin311/dsh-universal-palette/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.2--rc.1-2962ff.svg)](docs/COMPATIBILITY.md)
[![node](https://img.shields.io/node/v/%40yunmin311/dsh-universal-palette.svg)](package.json)
[![CI](https://github.com/yunmin311/dsh-universal-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/yunmin311/dsh-universal-palette/actions/workflows/ci.yml)

English | [简体中文](README.zh-CN.md) · Language: 简体中文

面向 DeepSeek Harness Web 的命令、会话、模型与历史统一面板：一次按键，当前工作区的一切触手可及。

![活动会话中的完整全局悬浮面板](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/active-global-floating.png)

## 为什么需要 Universal Palette

DSH 的能力通过插件不断增长：官方与社区插件持续添加 Host 命令、客户端命令 UI、模型与引用源。这些能力的原生入口散落在不同位置——斜杠菜单、模型选择器、侧栏、输入框 `@` 菜单——没有一个地方能回答键盘用户真正关心的问题：*当前工作区里我现在能用什么，怎么到达？*

Universal Palette 为同一个搜索控制器提供两种呈现：有上下文的 Composer Search，以及面向全局导航的悬浮面板。它不维护第二套目录：每一条命令、会话、模型和历史命中都在查询时来自 DSH 的公开 Client API，因此 DSH 与社区生态变化时，Palette 无需任何修改即自动保持正确。

它刻意保持克制：DSH 官方设计令牌、原生界面之上的玻璃质感、跟随界面语言的文案，以及对一切没有经过验证公开 contract 的东西零行为影响。

## 功能

- **命令** — 完整的实时 Host 命令目录，全部经官方 API 搜索与执行；DSH 或任何插件新增的 Host 命令零适配自动出现。
- **模型** — 会话的真实模型目录与当前选择，经公开选择契约提交。
- **会话** — Current 优先的会话导航，稳定 Session ID 去重，不做按标题合并。
- **历史命中** — 经 DSH 自带的会话全文搜索，展示片段与元数据。
- **确定性相关性** — 精确前缀优先打分加最低相关性门槛；最近使用与上下文只影响真实相关结果的排序。
- **原生外观与语言** — DSH 设计令牌、官方菜单排版与层级、玻璃表面、跟随 DSH 语言的中英文案。
- **公开契约互操作** — 与社区插件按能力检测协作；不读私有 registry、无硬依赖。

## 快速开始

```powershell
dsh plugin --profile web add @yunmin311/dsh-universal-palette@0.2.0
dsh --profile web
```

**Composer Search**

- 从 DSH 原生 slash 菜单输入 `/find`，或点击 Search 按钮。裸 `/` 仍完全由 DSH 接管。
- Composer 始终是唯一查询输入框。`/find query` 保留在 Composer 中；Search 按钮则直接从当前 draft 打开同一个搜索，不插入 `/find`。
- 活动会话中，结果以紧凑的 DSH 原生样式呈现在 Composer 上方。
- 零轮次 Hero 会话中，结果以同样的 DSH 原生样式直接呈现在 Composer 下方：常规文档流，约 5 行可见加内部滚动，绝不遮挡 Composer。**这要求宿主声明 `conversation.hero.composer.dock` 席位**——在不提供该席位的宿主（包括官方 `0.1.2-rc.1`）上，Hero 页面的 Composer Search 直接 fail closed，绝不向上回退；见[兼容性](#兼容性)。
- Hero 与活动会话两种呈现共享同一个控制器、同一组 provider、同一套排序与结果执行。

**全局搜索**

- Windows/Linux 按 `Alt+Q`，macOS 按 `Cmd+Shift+K`。
- 打开悬浮面板：零轮次使用紧凑版，活动会话使用完整的 600px 版本。

已有用户的自定义快捷键不会被覆盖。`Esc` 关闭面板；点击悬浮面板外部会关闭并把点击穿透给 DSH。

## 使用

| 操作 | 效果 |
|---|---|
| `/` | 使用 DSH 原生 slash 菜单 |
| Search 按钮或 `/find` | 从 Composer 打开 Composer Search：零轮次 Hero 会话向下展开 Morph，活动会话向上展开 Morph |
| `Alt+Q`（Windows/Linux）或 `Cmd+Shift+K`（macOS） | 开关全局悬浮面板 |
| 输入 | 模糊搜索命令、模型、会话与历史 |
| `↑↓` | 移动选择 |
| `Enter` | 打开 / 执行选中行 |
| `Tab` | 操作面板（基础设施；当前内置 provider 仅提供主操作） |
| `Esc` | 关闭 |

## 两种搜索模式

### Composer Search — 上下文 / 嵌入式

活动会话中，Composer 始终是唯一查询输入框，搜索结果以紧凑的 DSH 原生样式直接出现在其上方。零轮次 Hero 会话中，同一个 Search 按钮或 `/find` 入口以常规文档流在 Composer 下方打开同一个结果面。

![零轮次 Hero 会话中向下展开的 Composer Search](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/hero-composer-down.png)

![活动会话中向上展开的 Composer Search](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/active-composer-morph.png)

### 全局悬浮面板 — 全局 / 导航式

全局快捷键始终打开悬浮面板。零轮次使用紧凑的 540px 呈现；活动会话使用本页顶部所示的完整 600px 呈现。

![搜索 goal 命令](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/command-search.png)

![带片段与元数据的历史命中](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/conversation-hit.png)

## 搜索面

| 搜索面 | 来源契约 | 动作 | 需要活动会话 |
|---|---|---|---|
| 命令 | `ctx.remote.commands.list / execute`（官方 Host 目录） | 执行 | 是 |
| 模型 | `ctx.modelDirectories`（官方模型目录） | 选择 | 是 |
| 会话 | `ctx.sessions`（官方会话控制器） | 打开 | 否 |
| 历史命中 | `ctx.sessions.search`（官方 FTS 边界） | 打开 | 否 |

## 社区互操作

互操作均对真实安装的插件验证——详见[互操作矩阵](docs/INTEROPERABILITY_MATRIX.md)。

- **Host 命令联邦：自动。** 社区插件的 Host 命令（如 dsh-tui-command-ext 的 `/clear` `/rename` `/unarchive` `/compact-fast`，或 `/code-review` 类插件）零适配出现并执行——Palette 读取实时官方目录。

  ![精确查询发现第三方 Host 命令](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/interop-command.png)

- **dsh-keys-palette：可选公开桥接。** 在其公开的 `keys.actions` registry 注册一个 `universal-palette.open` action，可为"打开面板"绑定快捷键。插件不存在时零影响。
- **已验证共存：** dsh-tui-command-ext、dsh-session-workbench、dsh-reference-anything、dsh-keys-palette、dsh-market——均已在真实 DSH 启动中同时安装验证。
- **无私有耦合。** Session Workbench 与 Reference Anything 目前没有公开 handoff API；Palette 不做超出共存范围的集成，并把 upstream gap 记录在案而不是绕过。

这不是"支持所有插件"——只消费上述契约，全部能力检测，插件不存在时零行为变化。

## 给插件作者

Universal Palette 联合的是 DSH 的公开契约——想出现在面板里，不需要和 Palette 集成。

- **Host 命令**：通过 DSH 官方 Host 命令契约（`ctx.commands.register`）注册即可，Palette 每次查询都会从实时目录自动发现你。无需依赖 Palette、无需 adapter、无需协调发版。
- **更深的互操作**：只有当你的插件暴露稳定公开 Cordis service 时，才会考虑做可选的、按能力检测的 adapter；插件未安装时必须零影响、卸载时生命周期正确。现行正例是 dsh-keys-palette 的公开 `keys.actions` registry——Palette 借它贡献了一个可绑定快捷键的"打开面板"action。
- **Client-only `commandUi` 命令、私有 registry、DOM 状态、内部路由均不接入**——这些场景保持共存关系，等待公开 API（[upstream gaps](docs/UPSTREAM_INTEROP_GAPS.md)）。
- **会话 / 引用 / 工作区类插件同理**：公开 handoff service 或官方契约是进入 Palette 二级集成的唯一路径；没有公开 seam 即 `WAIT_PUBLIC_API`。

Universal Palette 目前没有 Provider SDK，也没有相关计划。推荐的生态路径是：**向 DSH 注册，Palette 联合公开契约。**细节与已验证案例见[互操作矩阵](docs/INTEROPERABILITY_MATRIX.md)。

## 兼容性

验证并锁定于 `@deepseek-ai/dsh@0.1.2-rc.1`（`deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`）。其他 DSH 版本未经验证。详见 [COMPATIBILITY.md](docs/COMPATIBILITY.md) 与 [COMMAND_COMPATIBILITY.md](docs/COMMAND_COMPATIBILITY.md)。

在锁定的 DSH `0.1.2-rc.1` Hero 界面中，会话级 Composer Morph outlet 不会挂载，且官方 `0.1.2-rc.1` 并不暴露 `conversation.hero.composer.dock` 席位。因此 Composer Search 在 Hero 页面**直接 fail closed**：Search 按钮禁用、原生 slash 菜单不展示 `/find` candidate；手工输入的 `/find …` 仍会被 claim，但 Enter 后返回本地化的 capability 错误——既不会把内容提交给 Agent，也绝不会向上回退成 Morph。活动会话的 Composer Search 与全局悬浮面板（`Alt+Q`）不受影响。

Hero 向下呈现仅在声明了 `conversation.hero.composer.dock` 的宿主上启用。当前完整验证的宿主是维护者自己的增强 fork（`yunmin311/deepseek-harness`，分支 `feat/hero-composer-dock`）；这不是 upstream 支持——该 fork 将作为完整 Hero 体验的长期增强宿主进行维护。

## 隐私与安全

- 无遥测、无统计埋点。
- 不发起任何自己的网络请求：一切经由 DSH 进程内的公开 Client API。
- 不读取、不存储任何凭据；验收 profile 本身即无凭据运行。
- 用户偏好（快捷键、使用频率）保存在浏览器 `localStorage` 中本插件自己的命名空间下。
- 历史搜索委托 DSH 的会话 FTS；其数据库属于 DSH profile，不属于本插件。

## 测试

- `pnpm run check` — 类型检查 + 单元测试（含 Keys Palette 桥接生命周期）。
- `pnpm run build` — Host ESM 面 + 带 purity gate 的浏览器 CJS bundle。
- Windows 真机验收：官方命令兼容性 gate（[`scripts/command-compat.mjs`](scripts/command-compat.mjs)）、多插件共存探针（[`scripts/interop-probe.mjs`](scripts/interop-probe.mjs)），证据见 [`evidence/`](evidence/)。

## 已知限制

- 锁定 DSH `0.1.2-rc.1`；其他版本未验证。
- Client-only `commandUi` 命令（如弹出式选择器）不可发现——DSH 尚无公开枚举接口（[upstream gaps](docs/UPSTREAM_INTEROP_GAPS.md)）。

## 开发

```powershell
pnpm install
pnpm run check
pnpm run build
```

## 文档

- [架构](docs/ARCHITECTURE.md)
- [兼容性](docs/COMPATIBILITY.md)
- [命令兼容性](docs/COMMAND_COMPATIBILITY.md)
- [设计合同](docs/DESIGN_CONTRACT.md)
- [互操作矩阵](docs/INTEROPERABILITY_MATRIX.md)
- [Upstream 接口缺口](docs/UPSTREAM_INTEROP_GAPS.md)
- [变更日志](CHANGELOG.md)

## 许可证

[MIT](LICENSE)
