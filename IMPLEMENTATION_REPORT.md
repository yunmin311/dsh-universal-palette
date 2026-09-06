# Design Gate 修订 — REVIEW_REQUIRED

日期：2026-09-05。用户确认 Design Gate 基本通过，冻结视觉并授权在 Session 去重修复、验证后 commit + push。
修复基线 HEAD：`c1273e7d2d59679566a6a990bdb02cd05d7991ba`；本报告随完整修复和 evidence 一并提交。
锁定 DSH：`76fda729799fe9b3848dbe2c211d4b231032b81e` / 0.1.2-rc.1。

## 本轮变化

提交前最后修复：空 query 在8条结果截断之前，按稳定 Session ID 去重，明确标记的 Current 行优先保留并置前；空位由其他不同 Session 补齐。同名不同 ID 保留。其他类型只折叠相同类型、相同条目 ID；命令 /model 与 model 结果等不同类型不合并。已核查 Host/Client /model 的既有同名 guard。回归覆盖 Current/Recent/其他来源重复、补位、同名不同实体和跨类型保留，不改变既定视觉或业务架构。

1. 搜索相关性：标题、命令名、别名和前缀优先，文本权重0.80；上下文、使用记录、置顶只作有界辅助。最低文本相关性0.60，description 仅连续匹配且得分0.20，不能独立把无关项带入结果。删除 description 跨字符匹配；历史 snippet 保留连续片段检索。goal、permission、flash、cobalt-otter-904 均有回归测试，真实 DSH 下 goal 只返回 /goal。
2. 玻璃：官方 menu surface 76% + transparent，blur22px、saturate1.12、0.5px 官方 border-l1 和弱 panel elevation。文字保留官方不透明颜色，无硬编码颜色。
3. 语言：通过官方 locale.register/bind/getSnapshot/subscribe 注册中英字典，跟随 DSH 当前语言即时刷新，输入框身份保持不变。界面自有提示、命令说明、状态、相对时间均本地化。用户会话标题、历史正文、模型名、协议命令名和品牌名保留原文。
4. 信息层级：空 query 显示极轻的 当前 / 快捷操作 / 模型 分组，先取最多8条再分组；搜索状态保持单一列表。历史结果在标题同行显示 历史 · 相对时间 · 工作区，不增加行高。

React + CSS Module、真实 adapters、原 aggregator 架构、主工作区响应定位、Esc 分层关闭、快捷键 toggle、focus 恢复和外部点击穿透均保留。

## 官方复用

直接使用 DSH IconSearchOutline16、IconNewChatOutline16、IconFolderOpenOutline16、IconClockOutline16、IconSparkle16；目录和模型选择器由 DSH 自己呈现。
Palette 为插件自身 React 组件；Menu/PopupSelect 的表面、行样式是适配，不声称直接实例化了官方 Menu。参照锁定 SHA 的 PopupSelectView.module.css、ui-primitives、ui-theme、ui-layout；保留 [MIT attribution](THIRD_PARTY_NOTICES.md)。

核心 tokens：`--dsw-specific-menu`、`--dsw-alias-label-primary/secondary/tertiary`、`--dsw-alias-interactive-bg-hover`、`--dsw-alias-border-l1/l2`、`--dsw-elevation-panel`、`--dsw-elevation-stroke-color`、`--dsw-font-family`、`--ds-font-family-code`、`--ds-transition-duration-fast`、`--ds-ease-in-out`，以及官方 error/scrollbar tokens。
搜索/标题/metadata/footer 为14/13/12/11px；外圆角20px，行圆角8px，宽约600px，高度随内容变化。

## 验证和截图

- pnpm run check：类型检查和34项测试通过，包含 Session 去重、4个指定 relevance 回归词、slash-only 前缀、本地化，以及真实 Edge 组件的输入框/caret、Action Panel→Palette Esc、toggle、外部点击和focus。
- pnpm run build：Host ESM 与 DSH lazy-CJS 浏览器包通过。CJS/mixed-export 提示符合当前锁定加载器。
- Windows 上真实 DSH Web + Microsoft Edge，1792×896，无 mock adapters。只使用两个隔离 DSH_HOME；正常用户配置未改。
- [本轮逐项结果](evidence/2026-09-05-design-gate/SMOKE.md) / [机器记录](evidence/2026-09-05-design-gate/smoke-results.json)。
- [无会话](evidence/2026-09-05-design-gate/01-no-session.png)、[空 query](evidence/2026-09-05-design-gate/02-empty-query.png)、[goal](evidence/2026-09-05-design-gate/03-goal-results.png)、[历史命中](evidence/2026-09-05-design-gate/04-conversation-hit.png)、[玻璃透底](evidence/2026-09-05-design-gate/05-glass.png)。
- 透底图使用真实 DSH 空白会话输入框中的未发送测试草稿，截图后已清除。没有为截图调用模型、写入历史消息、安装第三方插件或修改 DSH 页面样式。
- 历史截图里的缺密钥记录来自原有测试会话。当前官方 providers 无 secondary actions，所以两级 Esc 用真实浏览器组件 fixture 验证，未添加假 action 到产品。
- 本地 trace 含认证 URL，已在 Git 中忽略，不作为可分享证据。

## 保留的边界

公开 layout API 没有主内容矩形或实时 sidebar 宽度。通过公开 sidebar.footer.action 的 wide prop 使用响应式估计，无 private store 或 host DOM scraping。1792×896 默认侧栏下展开/收起 x736/x624，中心1036/924；任意拖拽宽度和详情面板的精确定位仍是明确限制。

[设计合同](docs/DESIGN_CONTRACT.md) 固化互操作方向：优先官方公共 contract，未来才考虑稳定的 optional community adapters；只做发现与 handoff，不复制第三方 UI/数据库。内部 result.source、primary/secondary actions 保持开放，未恢复公开 registerProvider()。锁定 Client command UI 缺少公开枚举接口，不能声称覆盖任意 Client-only command；当前 Host catalog 全量消费，/model 使用已知官方 Client 公开调用。社区真机互操作验收留给独立 v0.2。

## 回退

提交后如需回退，应审查对应修复提交并使用 revert，重新构建；不要重置其他工作或删除 DSH 历史。
