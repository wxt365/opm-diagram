# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/assistant-attachments-feature-spec.md

- [x] 边界已确认，按 Spec 执行；无匹配 playbook，未新增 .harness 内容。
- [x] A1 — AssistantPanel Vitest 验证按钮名称、图标按钮顺序、选择和移除。
- [x] A2 — Vitest 验证独立发送、失败保留、成功清空、只读禁用和切范围清理；代码限制读取/运行中操作。
- [x] A3 — node:test 使用真实 PDF/DOCX 文档解析，验证 OPD 和脑图 harness 实收正文及追问复用。
- [x] A4 — node:test 验证空文件、大小/编码/格式、损坏文档、扫描 PDF、作用域和响应隐藏正文；HTTP 验证附件请求及其他请求限制。
- [x] A5 — 助手 124/124；面板 31/31；web typecheck 通过；三个前端变更文件定向 ESLint 通过；git diff --check 通过（仅 CRLF 提示）。

未执行真实模型联网及浏览器人工视觉验收。可启动现有工作台和助手，点击发送左侧回形针选择文档，检查圆形按钮、文件名换行、移除和错误提示；发送后追问文档事实，观察引用文件名及 PDF 页码。扫描 PDF 应提示先文字识别。模型引用准确性仍取决于实际模型回答，不保证每次生成引用。

## 完整变更清单

- apps/web/src/modules/workbench/AssistantPanel.vue
- apps/web/src/modules/workbench/AssistantPanel.spec.ts
- apps/web/src/shared/api/assistantApi.ts
- apps/assistant/src/documents.mjs
- apps/assistant/src/server.mjs
- apps/assistant/src/service.mjs
- apps/assistant/src/mindmap-service.mjs
- apps/assistant/src/messages.mjs
- apps/assistant/test/documents.test.mjs
- apps/assistant/package.json
- package-lock.json
- specs/assistant-attachments-feature-spec.md
- specs/assistant-attachments-feature-checklist.md
