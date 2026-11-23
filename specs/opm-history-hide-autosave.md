# 隐藏自动保存历史

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change; Risk Level: L1; Task Type: feature; Active Playbooks: none (primary)。

## Plan
### Lean Spec
目标：操作历史列表不显示 AUTO_SAVE，活动草稿和只读版本一致。
非目标：改变自动保存、删除既有记录、影响撤销链。
允许：OperationHistoryRepository.java、DraftSaveControllerTest.java、本规格。禁止：schema、API契约、配置、依赖、其他文件及 .harness 修改。
契约影响：无字段变化。验收 A1：分页之前排除 AUTO_SAVE，编辑/手动保存/固定版本仍显示。
验证：现有历史后端测试及实际接口只读查询。回滚：只恢复本次过滤条件和断言。
实施：服务端查询过滤，避免前端隐藏造成空页。

## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认。
- [x] A1：DraftSaveControllerTest 23 项通过，BUILD SUCCESS；git diff --check 通过。后端已重启；实际 PostgreSQL 模型历史接口成功返回，AUTO_SAVE 为 0，撤销入口保留。没有删除保存记录或修改自动保存流程。
