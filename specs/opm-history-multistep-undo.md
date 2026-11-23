# 操作历史连续撤销

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: feature; Active Playbooks: none (primary)。沿用 AGENTS.md；repo-profile/task type/playbook 文件当前缺失。

## Spec
目标：连续撤销模型编辑；撤销后该编辑及内部撤销记录从活动历史隐藏，上一编辑成为可撤销项；保存、刷新、重启不丢撤销链。
非目标：重做入口、任意行跳转、数据迁移、无证据恢复旧记录。
允许：草稿恢复/历史存储实现及相关测试、历史前端文案及定向测试、本规格；允许重启后端。禁止：schema、配置、依赖、案例数据、无关文件、.harness 写入。保留现有未提交修改，尤其 application.yml。
契约影响：复用 RESTORE_OPERATION 的 UNDO 与可选 recovery_action，活动历史仅暴露 UNDO。数据库已有内部命名空间保存链节点，无新表。
边界：智能整图、格式升级等原有不支持操作仍作为边界；旧历史仅在完整 checkpoint/journal 和摘要匹配时补接，无法重建则停止。旧单步 REDO 不再作为活动恢复入口。
验收 M1：至少三次编辑连续撤销至初始文档，持久化后仍可继续。M2：已撤销和内部撤销记录在 HEAD 隐藏，保存记录不阻断；只读版本不隐藏历史。M3：新分支可撤销，过期和重复请求安全。M4：旧日志有证据才恢复；实际 PostgreSQL 和 SQLite 验证。
验证：后端事务/HTTP 定向测试、前端面板测试、真实模型只读历史查询与重启健康检查。回滚：仅还原本轮差异；保留既有数据，恢复命令仍是普通持久编辑。

## Plan
1. 将单步恢复槽扩展为前驱链接，恢复时移动到前驱并绑定最新 token。
2. 按可重建日志补接旧记录，过滤活动历史后再分页。
3. 测试连续撤销和隔离性，重启验证。

## Checklist
Spec: specs/opm-history-multistep-undo.md
- [x] 边界已确认。
- [x] M1
- [x] M2
- [x] M3
- [x] M4

## 实际验证
- SQLite 初轮后端 96 项通过；补充旧日志补接测试后，DraftJournalRepositoryTest 11 项通过。
- PostgreSQL 隔离 schema 的 DraftSaveControllerTest 23、DraftWorkspaceControllerTest 63、DraftJournalRepositoryTest 11，合计 97 项全部通过，BUILD SUCCESS。覆盖三步撤销至初始内容、保存检查点后撤销、重新构造仓储、重复/过期请求、新分支、失败回滚、删除恢复、分页，以及移除恢复槽后依靠旧 Journal 连续两步恢复。
- 前端现有历史面板/会话/加载测试 58 项通过；没有前端实现变更，继续复用现有按钮及刷新。
- 已重启后端；截图模型的真实 HTTP 查询经 5173 工作台代理成功返回 10 条可见记录，内部撤销/已撤销条目为 0，最新可恢复操作为“删除关系断言”，动作 UNDO。后端健康 UP。用户模型上仅只读查询，未代执行撤销。
- 未执行真实浏览器连续点击；通过真实 PostgreSQL 的 HTTP Controller 和持久存储验证，不声称浏览器端到端通过。
- 旧记录需日志和检查点完整；现已确认截图中“删除关系断言”可恢复，但不保证所有更早记录都保留了恢复数据。遇到数据缺失或原有不支持的编辑边界停止，不能越过边界伪造初始状态。
- 测试日志：test-results/history-multistep.log、history-multistep-pg.log、history-multistep-sqlite-final.log（忽略产物）。

## 本轮完整改动清单
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftOperationRecovery.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/OperationHistoryRepository.java
- services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJournalRepositoryTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- specs/opm-history-multistep-undo.md
