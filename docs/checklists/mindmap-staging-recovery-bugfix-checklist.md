# 脑图转换暂存失败修正检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

- Spec：docs/specs/mindmap-staging-recovery-bugfix-spec.md
- 边界确认：仅助手转换、诊断、测试和相关说明；API/schema/数据库/依赖/用户模型与脑图禁止修改。
- [x] A1 暂存失败进入自动修正并保留后续有效预览。
- [x] A2 完整基线、失败证据及移除项可追溯。
- [x] A3 修正后最终校验门禁及停止行为。
- [x] A4 不可恢复错误和分析续聊诊断。
- [x] A5 定向/全量测试、只读案例验证与 diff 检查已执行；全量既有失败见下。

## 实际验证

- `node --test apps/assistant/test/mindmap-staging.test.mjs apps/assistant/test/mindmap.test.mjs apps/assistant/test/mindmap-repair.test.mjs`：21/21 通过，含新增 9 项回归，覆盖恢复、身份/权限限制、无效修正、迟到工具、停止、超时及最终诊断阻断。
- `npm run assistant:test`：允许临时本机监听后 132/134 通过。DOCX/PDF 两项附件测试因本机缺少 jszip / pdfjs-dist 等已声明依赖失败；在临时目录导出未修改 HEAD、复用同一 node_modules 单独执行，两项同样失败。本任务未修改附件代码或依赖。日志 `/private/tmp/opm-assistant-staging-tests-local.log`、`/private/tmp/opm-attachment-baseline-tests.log`。
- 本机历史案例恢复分析 revision 5，前 38 步只读预览成功，第 39 步稳定返回 DRAFT_EDIT_REJECTED / ENDPOINT_KIND_MISMATCH。
- 使用临时助手目录、确定性修正器和真实 SQLite 后端的只读 plan-preview 重放，收集 rel.7～rel.12 及 rel.24 共 7 项错误；成功进入修正并继续到平台最终诊断，blocking=0，coverage_state=INCOMPLETE。前后 DraftToken 与投影相同，没有应用方案或改写用户脑图。日志 `/private/tmp/opm-staging-live-smoke.log`，证据目录由该日志末尾给出。
- 历史脑图已更新，以上重放仅验证步骤和平台诊断，不验证旧来源 CAS；修正器未调用真实大模型，独立语义审查未运行，测试提案明确保持 blocked，不声称该业务模型语义审查通过。
- 已仅重启空闲智能助手，`17860/health` 返回 UP / deepseek-flash；后端 liveness 和前端页面均 HTTP 200。
- `git diff --check` 通过。用户数据、API、schema、依赖和前后端源码均未变更。
