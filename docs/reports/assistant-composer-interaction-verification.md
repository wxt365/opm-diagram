# 助手输入与消息修订验证

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

2026-11-20；[规格](../specs/assistant-composer-interaction-spec.md)。分支沿用 `codex/harness-0-2-2-rc5`，保留前序未提交修改，未提交或打包。

## 根因与修改

业务助手只绑定 Ctrl/Cmd+Enter，因此普通回车不发送；所有用户消息均展示编辑入口；原编辑实现追加更正文本，形成两个用户气泡。现在业务输入统一处理 Enter／Shift+Enter／输入法／重复按键；两类助手只允许最近用户消息编辑。更正发送原文和可选 editMessageId，后端校验其仍是最近用户消息，内部追加 supersedes 审计记录，界面投影替换该轮问题和旧回复。正式模型和已应用方案不回滚。普通发送及旧会话保持兼容，不按文字猜测并合并历史上的两个气泡。

## 已执行验证

- 修改前组件回归复现 4 项失败：两种业务范围 Enter 未发送、多轮编辑入口未限制。修复后定向 44 项通过；包含换行、IME、229、composition、长按、Ctrl/Cmd、只读、生成、发送失败重试和取消草稿。
- 前端关联回归 42 文件、357 项通过；`npm run typecheck --workspace @opm/web` 通过；四个修改组件／测试文件定向 ESLint 通过。
- 助手全量 180 项通过，包含新消息投影及 OPM／OPM脑图／业务／业务脑图服务测试。覆盖连续修订、旧／伪造身份 409、原文保留、模型收到修订指令；附件 HTTP 测试桩从末参数改为固定附件位置，适配新可选参数，原附件限额用例继续通过。
- 浏览器使用隔离项目、真实 Java／SQLite、真实 Harness SDK 及本机模拟模型；不向外部模型发送数据。业务中 Shift+Enter 保留两行，Enter 发送，两轮只在最近问题显示按钮；生成期间无可用编辑入口。OPM、业务、业务脑图编辑后只显示修订轮次和新回复，业务刷新后仍保留正确投影，早期对话保留。没有修改正式模型，业务仍修订2，OPM仍编辑序号1。
- `git diff --check` 通过。类型检查曾发现 findLast 不在前端编译目标中，改用复制后 reverse/find，未修改 TS 编译目标或增加 polyfill。

本机证据：`/private/tmp/assistant-composer-before.log`、`assistant-composer-after.log`、`assistant-composer-all-backend.log`、`assistant-composer-web-regression.log`、`assistant-composer-typecheck.log`、`assistant-composer-lint.log`；截图 `/private/tmp/assistant-edit-opm.jpg`、`assistant-edit-business.jpg`、`assistant-edit-mindmap.jpg`。这些是本机临时证据，不提交到 Git。

## 范围与回滚

本轮不实现脑图流式增量渲染，不验证外部模型理解质量，不回滚历史模型，不批量改写现有对话。回滚只撤销本规格对应差异；存量 supersedes 附加字段不涉及数据库迁移，旧版可能重新展示内部原文，因此回滚前应保留会话备份。

文件清单：

- `apps/web/src/modules/business/BusinessAssistantPanel.vue`、`BusinessAssistantPanel.spec.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`、`AssistantPanel.spec.ts`
- `apps/assistant/src/message-edit.mjs`、`messages.mjs`、`service.mjs`、`mindmap-service.mjs`、`business-service.mjs`、`server.mjs`
- `apps/assistant/test/message-edit.test.mjs`、`documents.test.mjs`
- `apps/assistant/README.md`、本规格与验证记录
