# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/unified-history-failure-bugfix-spec.md

- [x] 边界确认：仅 Spec 允许文件，无公共契约/后端变化。
- [x] F1 — 两次语义编辑被拒绝分别保留 undo/redo；成功编辑后清理本地栈，用例通过。
- [x] F2 — 查询失败显示错误并保留本地撤销；点击重试成功后提示清除、恢复候选可用。
- [x] F3 — 新增两用例修复前失败、修复后通过；78 个文件/685 项前端测试全部通过。vue-tsc、三个变更前端文件 ESLint、git diff --check 通过（仅 CRLF 提示）。

验证日志：test-results/history-failure-before.log、history-failure-after.log、history-failure-web-all.log。未做真实浏览器验收；本次无后端变更，未重复执行后端测试。按 AGENTS.md 第 7 条记录漏验和 Eval。
