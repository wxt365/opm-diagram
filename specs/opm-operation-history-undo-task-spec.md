# 操作历史一步撤销与重做

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: feature; Active Playbooks: none (primary)。
仓库 .harness/repo-profile.md、task-types/feature.md 和 playbooks 当前缺失；沿用 AGENTS.md 与现有实现，不新增 .harness 内容。

## Spec
目标：最近一条可恢复编辑在操作历史右侧显示“撤销本次操作”；撤销后提供“重做本次操作”。恢复真实模型并继续自动保存。
非目标：任意历史恢复、多步栈、工具栏语义撤销、补回旧操作恢复数据、选择性合并、数据库迁移。
允许：apps/web/src 的工作台/API/store及定向测试；services/local-runtime 的草稿应用/存储及测试；scripts/generate-draft-workspace-contract.mjs 与对应生成契约；本规格与相关测试。
禁止：数据库 schema、依赖、配置、案例模型、无关重构、.harness 写入。
契约影响：现有草稿编辑增加 RESTORE_OPERATION 命令；历史项增加可选 recovery_action。沿用 EDIT 幂等投递、版本冲突检查和事务，不新增接口路径或数据库表。内部独立命名空间仅保存每模型最近一步的目标完整状态、当前及目标摘要，恢复后以恢复前的状态替换目标，避免依赖可压缩日志；不向浏览器暴露文档。
范围：模型级最近改变内容的编辑；无变化编辑和保存不替换恢复点。旧数据无恢复点则不显示按钮。恢复是新编辑，不回退 edit_seq、不删除历史。模型有新编辑则旧重做失效。智能整图方案、含脑图来源映射的编辑及改变文档 schema_version 的编辑暂不开放恢复，避免附属映射不一致或隐式降级文档格式；发生这些编辑会清除旧恢复点。
验收：
- U1 后端原子保留最近一步前后状态，保存/重开不清除；新编辑替换恢复点。
- U2 撤销/重做完整恢复语义及布局；检查模型/草稿/当前摘要/历史 ID，重复请求幂等，冲突与失败不破坏恢复点。
- U3 HEAD 历史仅目标行有入口；只读、提交、未保存本地布局、投递未决时禁用；旧历史无入口。
- U4 恢复后刷新画布、导航、文本与历史，错误可见；撤销记录保留，原记录标记已撤销。
- U5 定向后端/前端/契约验证及类型检查；记录实际执行结果和限制。
验证：定向事务测试、契约生成检查、前端测试/typecheck/lint；可用环境下运行后端测试及浏览器验证。
回滚：仅恢复本任务差异；新增内部恢复点由旧程序忽略，恢复编辑仍是普通持久草稿差量。

## Plan
1. 扩展生成器并复用 EDIT 投递；存储事务保留一个恢复槽。
2. 应用层校验恢复模型；历史查询返回后端计算的可用动作。
3. 工作台历史按钮及刷新、并发和未提交布局守卫。
4. 定向验证并记录结果。

## Checklist
Spec: specs/opm-operation-history-undo-task-spec.md
- [x] 边界确认：以上 API/契约、实现、文档、测试允许；schema/依赖/配置/案例禁止。
- [x] U1
- [x] U2
- [x] U3
- [x] U4
- [x] U5（实际执行及限制见下）

## 实际验证

- 后端 96 项通过，BUILD SUCCESS：DraftJournalRepositoryTest（10）、DraftWorkspaceControllerTest、DraftSaveControllerTest。新增真实 SQLite 事务和 HTTP 流程覆盖级联删除后文档完全相等、撤销/重做、无变化编辑、手动保存/检查点之后恢复、重新实例化读取、重复请求、过期记录、恢复失败回滚、新编辑使旧重做失效。日志：test-results/operation-undo-backend.log（忽略产物）。
- 前端 58 项通过：draftWorkbenchSession.spec.ts、WorkbenchBottomPanel.spec.ts、operationHistory.spec.ts，覆盖恢复 EDIT 投递、按钮文案/禁用/只读/旧记录及既有历史加载。
- 新增恢复命令与历史严格契约定向 2 项通过；生成器 --check、vue-tsc、ESLint、生产 web build、git diff --check 通过。构建保留既有 bootstrap script 与 chunk 大小提示。
- 完整草稿契约测试首轮 18 项中 17 项通过；既有路径数断言为 13，当前仓库已有 mindmap/plan-preview 等共 15 条路径，导致该项失败。本次未新增路径，也未顺手调整无关断言。新增恢复用例随后单独执行通过。
- Maven 默认仓库标识与缓存 local-nexus 不同，在线尝试又遇 DNS 失败；最终使用临时 settings 匹配已有缓存，以离线方式完成编译与全部上述后端测试。未修改项目/用户配置。
- 未执行真实浏览器端到端和进程重启：本机没有监听的工作台服务，本轮使用组件测试、真实 HTTP Controller、SQLite 与生产构建验证；不将其表述为真实浏览器通过。
- 可执行手工验收：启动新版前后端，进入测试模型→删除一个节点或关系→打开操作历史→等待自动保存或手动保存→点“撤销本次操作”，观察节点、关联关系和位置恢复，原记录显示已撤销→点新记录“重做本次操作”，观察删除重新生效；刷新后恢复点仍可用。撤销后做新编辑，旧重做按钮消失；历史只读版本无恢复按钮。本地布局未保存时先保存再恢复。

## 完整改动清单

- apps/web/src/modules/workbench/WorkbenchBottomPanel.vue
- apps/web/src/modules/workbench/WorkbenchBottomPanel.spec.ts
- apps/web/src/shared/api/draftWorkbenchSession.ts
- apps/web/src/shared/api/draftWorkbenchSession.spec.ts
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- apps/web/src/stores/workbenchRuntime.ts
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftOperationRecovery.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/OperationHistoryRepository.java
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJournalRepositoryTest.java
- scripts/generate-draft-workspace-contract.mjs
- scripts/draft-workspace-contract.test.mjs
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- specs/opm-operation-history-undo-task-spec.md
