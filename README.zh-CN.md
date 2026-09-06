# dsh-universal-palette

[![npm version](https://img.shields.io/npm/v/@yunmin311/dsh-universal-palette.svg)](https://www.npmjs.com/package/@yunmin311/dsh-universal-palette)
[![GitHub release](https://img.shields.io/github/v/release/yunmin311/dsh-universal-palette.svg)](https://github.com/yunmin311/dsh-universal-palette/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.2--rc.1-2962ff.svg)](docs/COMPATIBILITY.md)
[![node](https://img.shields.io/node/v/%40yunmin311/dsh-universal-palette.svg)](package.json)
[![CI](https://github.com/yunmin311/dsh-universal-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/yunmin311/dsh-universal-palette/actions/workflows/ci.yml)

English | [简体中文](README.zh-CN.md) · Language: 简体中文

面向 DeepSeek Harness Web 的命令、会话、模型与历史统一面板：一次按键，当前工作区的一切触手可及。

![深色主题下悬浮于 DSH Web 之上的 Universal Palette](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/hero.png)

## 为什么需要 Universal Palette

DSH 的能力通过插件不断增长：官方与社区插件持续添加 Host 命令、客户端命令 UI、模型与引用源。这些能力的原生入口散落在不同位置——斜杠菜单、模型选择器、侧栏、输入框 `@` 菜单——没有一个地方能回答键盘用户真正关心的问题：*当前工作区里我现在能用什么，怎么到达？*

Universal Palette 是一个悬浮在 `Ctrl+Shift+K` 上的半透明面板，把这些入口联合成一个确定性的、按相关性排序的列表。它不维护第二套目录：每一条命令、会话、模型和历史命中都在查询时来自 DSH 的公开 Client API，因此 DSH 与社区生态变化时，Palette 无需任何修改即自动保持正确。

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

`Ctrl+Shift+K`（Windows/Linux）或 `Cmd+Shift+K`（macOS）开关面板。`Esc` 关闭，点击外部关闭并穿透给 DSH。

## 使用

| 操作 | 效果 |
|---|---|
| `Ctrl/Cmd+Shift+K` | 开关面板 |
| 输入 | 模糊搜索命令、模型、会话与历史 |
| `↑↓` | 移动选择 |
| `Enter` | 打开 / 执行选中行 |
| `Tab` | 操作面板（基础设施；当前内置 provider 仅提供主操作） |
| `Esc` | 关闭 |

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
- dsh-keys-palette 默认 `Mod+Shift+K`（切换主题）在 Windows 上与面板 `Ctrl+Shift+K` 冲突；任一侧重绑即可。

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
