# 项目读取接替状态修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

## Spec

目标：回收操作在途、重新进入同项目时，列表刷新接替整页读取后必须正确结束整页 loading。
非目标：启动配置、产品流程建议、公共契约、后端及其他模块。
允许：apps/web/src/stores/projectModel.ts 及测试、本规格和 checklist；依 AGENTS.md 第 7 条追加既有 .harness/docs/agent-failures.md。禁止其他 .harness 内容、配置、依赖、schema、后端及范围外文件。保留现有差异。repo-profile/task-types/playbooks 缺失，遵循 AGENTS.md。
契约影响：无。
验收 H1：回收操作完成触发列表读取接替同项目整页读取后，成功时项目和列表均结束加载，旧整页响应无效。
验收 H2：接替请求失败时显示可恢复的项目错误，不能停留 loading；重试成功后恢复。普通列表失败保留已加载项目的行为不变。
验收 H3：跨项目及旧响应隔离、创建/数量后台刷新原有回归保持。
验证：新增成功/失败延迟用例先复现，再定向和完整前端回归、类型、定向 lint、diff 检查。
回滚：仅撤销本次增量，保留前期工作；无迁移。

## Plan

读取入口记录是否接替尚未完成的整页读取；成功提交项目摘要时统一将项目状态设为 ready，失败时按接替时捕获的责任结束整页 loading。用生命周期完成、同项目重入、旧请求晚到以及接替失败重试验证。
