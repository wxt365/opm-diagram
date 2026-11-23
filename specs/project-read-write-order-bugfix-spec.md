# 项目读取与创建确认时序修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

## Spec

目标：创建确认后旧列表不得覆盖新模型及数量；辅助数量查询不得阻塞创建成功返回和工作台导航。
非目标：启动配置、产品流程建议、公共契约、后端及其他功能改造。
允许：apps/web/src/stores/projectModel.ts 及测试、apps/web/src/modules/projects/ProjectDetailView.spec.ts、本规格及 checklist；依 AGENTS.md 第 7 条追加既有 .harness/docs/agent-failures.md 的漏验/Eval。禁止其他 .harness 内容、配置、依赖、schema、公共 API、后端及范围外实现。保留已有工作区修改。repo-profile/task-types/playbooks 缺失，按 AGENTS.md 执行。
契约影响：无。createModel 的 Promise 以创建确认作为完成条件，数量在后台更新。

验收 O1：创建前启动的 loadProject/loadModels 成功或失败晚到时不得回退当前列表/数量；仍活动的读取在检测到写入后重新查询；被新项目/范围替代的读取不得重试或回写；不遗留 loading。
验收 O2：创建确认后立即返回、解除创建忙碌并进入打开流程，数量查询挂起/失败不阻塞导航，不重复提交创建。
验收 O3：后台数量刷新保留错误提示和原范围重试；旧摘要不覆盖新项目、新列表或后续创建/已应用的新摘要；新模型仍按活动/回收站范围展示。
验证：新增可控延迟与失败用例先复现，再运行完整项目定向及前端回归、类型、定向 lint、diff 检查；无真实用户模型操作。
回滚：仅撤销本次增量，不覆盖先前修改；无数据迁移。

## Plan

1. 创建确认推进模型写入版本；两种列表读取共用读取函数，捕获版本并在跨写入时重新查询，保持现有请求序号隔离与错误处理。
2. 数量刷新改为有错误处理的后台任务，按项目身份、读取序号、写入版本及已应用摘要版本保护结果。
3. 增加响应次序矩阵：旧列表先/后返回、失败晚到、完整加载、切范围/项目、摘要悬挂及晚到；组件确认创建后即导航。
