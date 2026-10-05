# 助手问题更正与消息身份显示

Work Mode：change；Risk Level：L2；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

## Spec

目标：已发送问题支持编辑并发送更正；用户和助手使用图标身份栏，正文独立呈现。

非目标：回滚模型、删除或改写历史、Harness 对话分支、Markdown 渲染、跨图修改和依赖变更。

允许：AssistantPanel.vue、组件测试、专用浏览器测试、助手使用/设计文档、本规格。禁止：助手服务/API、Runtime、数据库、依赖配置、密钥、用户模型、`.harness/` 和其他未提交文件。

契约：复用现有 prompt，在同一固定会话追加明确的更正消息；原问题和提案保留，已应用修改不自动撤销。前端编辑模式回填原文，显示该语义，确认后才请求模型。取消编辑恢复原输入草稿，失败保留更正文案；生成中/提交中/只读不可开始编辑，切图清理编辑状态。

验收：ME-01 问题可编辑、取消及重发，保留输入与旧历史，失败可重试；ME-02 编辑状态正确遵守只读/运行/切图/晚到响应边界；ME-03 图标身份可访问、与正文分离，桌面及窄屏可用；ME-04 隔离模型真实 DeepSeek 更正后生成正确提案、预览和应用到画布，保存重开仍可见。

验证：定向组件/工作台测试、typecheck/lint/build、真实浏览器更正与画布验证、截图检查、差异及文档链接检查。回滚：撤销本轮前端改动，更正作为普通历史消息保留。

## Plan

复用现有消息与 prompt 数据结构，增加仅前端的编辑状态及发送上下文；复用 Lucide 图标与既有按钮样式。先实现组件边界测试，再创建独立测试模型验证真实纠错、布局与持久化。

## Checklist

引用：本文件 Spec。允许/禁止目录及历史追加语义已确认，保留此前未提交变更。

- [x] ME-01
- [x] ME-02
- [x] ME-03
- [x] ME-04

## 验证记录

2026-10-05：

- ME-01、ME-02、ME-03：`npm run test --workspace=@opm/web -- src/modules/workbench/AssistantPanel.spec.ts src/modules/workbench/WorkbenchView.spec.ts` 102 项通过（面板 10、工作台 92）。覆盖图标可访问名称、编辑/取消恢复草稿、同会话追加、发送失败保留更正、只读/运行/提交限制、切图清理、旧请求晚到不清空新图输入和字数上限。
- ME-04、ME-03：`OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/private/tmp/opm-assistant-proof.json npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-message-edit.spec.ts --output=/private/tmp/opm-assistant-message-edit-e2e` 1 项通过（9.2 秒）。独立新建测试模型中，原“手工开发”问题经编辑更正为“手工咖啡”，真实 DeepSeek 提出对应过程；预览前后草稿身份不变，确认后过程出现在画布，保存重开仍可见，原问题和更正历史均保留。无浏览器脚本错误。
- 人工检查 1600 像素桌面及 390 像素手机截图，身份图标、正文、铅笔入口、编辑提示及发送更正按钮正常，无面板横向溢出。证据在 `/private/tmp/opm-assistant-message-edit-e2e/`。
- `npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web`、`npm run build`（包含契约验证）、`git diff --check`、本轮文件空白及文档链接检查通过。构建保留既有 `/opm-bootstrap.js` 非 module 脚本提示，不影响完成。
- 本轮只验证现有纠错交互和画布持久化，不代表全部自然语言意图或完整 ISO 语义符合性。未改后端及用户模型，未提交代码。

关键文件：`AssistantPanel.vue`、`AssistantPanel.spec.ts`、`tests/e2e/workbench-assistant-message-edit.spec.ts`、`apps/assistant/README.md` 及本规格。前两项在 `apps/web/src/modules/workbench/` 下。
