# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/assistant-attachment-review-bugfix-spec.md

- [x] 边界确认：仅 Spec 允许文件，无公共契约或依赖变化。
- [x] R1 — 新用例覆盖 ready/blocked 与有/无历史 reviewRequest 四种组合；修复前失败于缺少附件文件名，修复后通过。
- [x] R2 — 读取真实 read_review_model 快照并核对持久化方案；再次不带附件追问，需求仍完整。
- [x] R3 — 助手完整 125 项通过；既有无附件续聊回归通过。git diff --check 通过（仅 CRLF 提示）。

实际验证使用注入的模型 harness、真实会话存储及审查工具路径，未连接真实外部模型；未改前端，因此未重复执行前端回归。根据 AGENTS.md 第 7 条追加既有 Failure 记录及关联 Eval，无新增 .harness 文件。
