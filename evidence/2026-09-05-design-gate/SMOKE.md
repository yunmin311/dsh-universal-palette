# Design Gate 实机检查 — REVIEW_REQUIRED

2026-09-05。修复基线 HEAD `c1273e7d2d59679566a6a990bdb02cd05d7991ba`。用户已确认 Design Gate 基本通过，授权最终去重修复验证后提交和推送。截图保留本轮审查版本，不再重出整套；机器记录更新包含最后的 Session ID 去重检查。

Windows DSH 0.1.2-rc.1，锁定 SHA 76fda729799fe9b3848dbe2c211d4b231032b81e。真实 Microsoft Edge 浏览器截图，均为1792×896，真实 DSH adapters 和隔离测试配置。截图使用 headless capture，不是 mock 页面。

| 本轮检查 | 结果 |
|---|---|
| 空 query Session identity | PASS：真实可见 Session ID 无重复，Current ID 仅出现一次且位于 Session 首位。回归测试额外注入同 ID 的 Current/Recent/另一来源，确认保留 Current 并由其他 Session 补足8条。不同 ID 的同名会话保留。 |
| goal | PASS：真实结果仅 `/goal`，没有 Pro 模型。 |
| permission | PASS：仅对应命令，没有无关模型或会话。 |
| flash | PASS：仅 DeepSeek-V4-Flash 和 DeepSeek-V4-Flash-Vision-Exp。 |
| cobalt-otter-904 | PASS：一个真实 Conversation Hit，点击打开同一个官方 sessionId。 |
| relevance 回归 | PASS：4个指定词均有单测，包含无关结果被置顶仍不能通过最低相关性门槛。 |
| 中文界面 | PASS：搜索框、引导、分组、命令说明、空结果、状态、相对时间和底部提示均本地化。用户原文/命令标识/模型品牌名保留。 |
| 语言即时切换 | PASS：官方 locale.setLocale 切换 zh→en→zh，文案即时更新，输入框仍为同一个 DOM 节点。另有 [英文图](locale-en.png)。 |
| 空 query 信息层级 | PASS：最多8条，当前 / 快捷操作 / 模型 弱分组；搜索状态无分组，保持单一列表。 |
| Conversation Hit metadata | PASS：历史 · 相对时间 · 工作区与标题同行，正文仍为一行 snippet，没有额外增高。 |
| 玻璃 / 深浅主题 | PASS：官方设置切换，[浅色](theme-light.png)、[深色](theme-dark.png) 均继承 tokens。测得76% surface alpha、blur22px、saturate1.12，文字为 DSH 官方不透明 primary。 |
| no-session / workspace-no-session | PASS：中文引导；选择工作区、新建会话、最近会话继续调用官方 API，原引导行为保留。 |
| Esc / toggle / focus | PASS：真实 DSH root Esc、快捷键开关、原焦点恢复通过。Action Panel 分层关闭继续由真实 Edge 组件测试覆盖，生产 providers 当前无 secondary actions。 |
| 外部点击穿透 | PASS：同一点击关闭浮层并切换侧栏或聚焦编辑器，编辑正常；root=none、surface=auto。 |
| 侧栏展开/收起 | PASS：默认1792窗口下 x736/x624、width600，原响应定位未变。任意拖拽宽度/详情面板精确几何仍无公开接口。 |
| 官方命令 | PASS：goal、permission、plan执行；plan off恢复；model打开原生选择器；feedback显示中文缺参数提示，不发送反馈内容。 |
| 浏览器异常 | 无 pageerror。 |

## 五张审查截图

1. [无活动会话](01-no-session.png)
2. [空 query](02-empty-query.png)
3. [goal](03-goal-results.png)
4. [Conversation Hit](04-conversation-hit.png)
5. [玻璃透底](05-glass.png)：底层是实际 DSH 输入框中的未发送测试草稿。没有覆盖页面样式、伪造内容图层或调用模型；截图后已清空草稿。真实输入框的边缘与文字在浮层下提供透底参照。

## 验证与复现

- `pnpm run check`：类型检查 + 34项测试通过。`pnpm run build`：两端构建通过。
- `node scripts/smoke-dsh.mjs --no-screenshots`：重跑完整实机矩阵并检查去重，不重出截图；[机器记录](smoke-results.json)。
- `node scripts/glass-dsh.mjs`：在隔离配置中创建一个真实空白会话，只编辑未发送草稿，截图后清除。
- 当前截图中的旧 MISSING_CREDENTIAL 和英文命令日志来自 DSH 自己的历史/Host 输出，不是 Palette 的界面文案；本轮未发送模型请求。
- 本地 trace 含认证 URL，已忽略，不作为分享材料。
- [设计与互操作合同](../../docs/DESIGN_CONTRACT.md)：社区协同仅记录方向，无社区插件安装、optional adapter 或公开 registerProvider()。v0.2 独立验收。

状态保持 **REVIEW_REQUIRED**，是否通过视觉审批由用户决定。
