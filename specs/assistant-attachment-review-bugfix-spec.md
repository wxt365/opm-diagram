# 附件续改方案的审查需求完整性

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

## Spec

目标：已有 ready/blocked 整图方案时，携带新附件续改，最终独立审查同时获得原需求、本轮文字和附件正文。
非目标：附件上下文压缩、解析改造、历史方案批量重审、前端交互调整。
允许：apps/assistant/src/service.mjs、apps/assistant/test/service.test.mjs、本规格和检查清单；按 AGENTS.md 第 7 条在已有 .harness/docs/agent-failures.md 追加本次漏验及 Eval。禁止：其他模块、公共 API、数据库 schema、配置、依赖、其他 .harness 内容及无关改动。保留当前工作区附件功能改动。
契约影响：无；复用现有 task.text、reviewRequest 及持久化审查流程。repo-profile、task-types 和 playbooks 文件缺失，依据 AGENTS.md 执行。

验收：
- R1：ready/blocked 续改时，审查需求保留原需求、本轮文字及新附件正文和文件名。
- R2：审查需求进入最终审查快照，并持久化到新方案，后续无附件追问仍可复用。
- R3：无附件续改保持原有拼接行为，助手完整回归通过。

验证：先用回归用例复现旧代码失败，再修正并执行附件定向测试与助手完整回归；不依赖真实模型联网。
回滚：仅撤销本任务需求拼接一行及新增回归测试；既有会话格式不变。

## Plan

复用已组装完整参考资料的 task.text 替代续改分支中的纯文本入参；测试从实际 prompt 出发，经最终审查快照和方案保存验证完整需求，覆盖两种方案状态及再次追问。
