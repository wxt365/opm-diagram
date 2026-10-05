# 多选移动和布局历史

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: frontend-vue (primary), backend-springboot, testing。

## 目标和边界

为后续对齐、分布和自动布局提供多选及原子布局保存基础。允许修改工作台画布、store、草稿 API 封装、草稿 V2 契约生成源及产物、Runtime 布局领域规则、对应文档和测试。禁止修改 V1 契约、数据库 schema、依赖、配置、其他页面、现有案例内容以及 .harness。保留工作区此前全部修改。

非目标：框选、批量删除、对齐、分布、适应画布、自动布局、连线避让、跨会话历史。

契约影响：草稿 V2 增量命令 UPDATE_LAYOUT_BATCH，携带 occurrence_id 和完整 x/y/width/height 数组；授权 scope 的 endpoints 必须精确覆盖所有目标，同 Context owned 节点。绝对几何快照包含随父移动的状态；服务端验证最终状态容纳关系，一次 journal 事务提交，不改变旧单节点命令。无数据迁移和新增依赖。

## 验收

- A1：Shift/Ctrl/Cmd 点击切换多个节点；单击及空白清除兼容现有关系、菜单交互；多选有可见高亮和数量提示。
- A2：拖动多选中一个节点按同一偏移移动全部可编辑选中节点，父与状态不重复移动，FINAL 轮廓同步；每次拖动只提交一个草稿命令。
- A3：批量提交原子；重复 ID、跨 Context、非法/只读节点、非法尺寸、状态越界、scope 不匹配、过期 token 拒绝且无部分写入；相同命令重试复用 receipt。
- A4：布局撤销/重做通过完整几何快照精确恢复位置和尺寸；新的移动清除 redo；语义编辑、重载、切换 Context/模型/只读版本清除历史；输入框原生快捷键不受影响。
- A5：保存重开保持移动结果；失败恢复服务端几何或锁定待确认状态；只读、提交期间不可移动/撤销。

## 实现决策与顺序

1. 生成草稿批量契约，扩展候选授权和领域几何验证，复用 journal/receipt。
2. 纯布局变换计算状态闭包、state 夹取与 owner 收缩；store 记录成功命令前后几何。
3. 画布修饰键多选、群组预览及单次提交；工具栏与快捷键撤销重做。
4. 定向领域/契约测试、前端测试及真实画布 e2e；构建本地服务后验证保存重开。

## Checklist

Spec: specs/opm-layout-selection-history-feature-task-spec.md。
边界已确认：仅上述允许范围；API 增量仅草稿 V2；无 DB/config/dependency 修改；原用户案例只读。
- [x] A1、A2 真实画布
- [x] A3 后端原子/幂等/授权及契约
- [x] A4 历史与快捷键
- [x] A5 保存重开/失败/只读
- [x] lint/typecheck/build/contract/diff

## 验证与回滚

复用现有 Vitest、JUnit、Playwright；新建验证模型，完成后移入回收站。回滚只撤销本轮文件差异，恢复先前草稿协议生成产物；无已持久化语义/schema变化，历史只驻留内存。

## 实际证据

- A1/A2/A4/A5：真实 Chromium Playwright 5/5（新增 workbench-layout-selection.spec.ts + 已有 workbench-node-placement.spec.ts）。实际创建对象、过程、属性、3 个状态；五项多选移动携带 7 个布局目标且 edit_seq 仅增加 1；FINAL 轮廓同步；单状态移动收缩容器后 undo/redo 恢复完整尺寸；Ctrl/Cmd/Shift 多选和快捷键、保存重开、Context 清历史、EXACT 禁止拖动、390px 视口入口可见。
- A5 故障注入：422 响应后服务端序号不变，画布恢复确认几何，保留原请求并进入待确认只读；通过恢复入口查询 receipt 并重试原 command_id，仅推进一次序号。独立验证模型全部移入回收站。最后通过新浏览器会话只读核对活动列表，仍为原客户演示、CTRL、NEG、PROC、STRUCT 五个模型。
- A3：DraftWorkspaceControllerTest、DraftWorkspaceContractTest、SemanticLayoutEditorTest 39/39；真实 SQLite 验证批量事务、非法目标/跨 Context/重复/scope 篡改/尺寸/状态越界零写入、幂等回执、token 冲突、恢复完整几何与 reopen。
- 前端 Vitest 126/126（布局计算、会话授权、画布、工作台）；Node 草稿契约 9/9（新批量 payload 的封闭字段、完整尺寸、空数组和非有限数拒绝）。沿用冻结旧向量，不修改原 13 命令向量。
- npm run lint、npm run typecheck、npm run build（含 contract:validate）、git diff --check 成功；后端离线 Maven package 成功。Vite 保留既有 opm-bootstrap.js 非 module 提示，不影响构建。
- 后端新实例已在 17850 启动；前端继续使用 5177，新增协议仅草稿 V2，无 schema 迁移/依赖/config 修改。
- 截图：test-results/workbench-layout-selection-多选移动只提交一次，状态去重、撤销重做及保存重开/multi-selection.png，已人工查看多选状态及特征接点。

## 本轮文件完整清单

- apps/web/src/modules/workbench/OpdCanvas.vue
- apps/web/src/modules/workbench/WorkbenchView.vue
- apps/web/src/modules/workbench/WorkbenchView.spec.ts
- apps/web/src/modules/workbench/opd/core/x6-node-layer.ts
- apps/web/src/modules/workbench/useWorkbenchNavigation.ts
- apps/web/src/shared/api/draftWorkbenchSession.ts
- apps/web/src/shared/api/draftWorkbenchSession.spec.ts
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- apps/web/src/stores/workbench/layoutSelection.ts
- apps/web/src/stores/workbench/layoutSelection.spec.ts
- apps/web/src/stores/workbenchRuntime.ts
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- docs/design/opm-modeling-tool-application-api-contract.md
- docs/design/opm-modeling-workbench-page-design.md
- scripts/generate-draft-workspace-contract.mjs
- scripts/draft-workspace-contract.test.mjs
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticCommandEditor.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- tests/e2e/workbench-layout-selection.spec.ts
- specs/opm-layout-selection-history-feature-task-spec.md

生成器对应 OpenAPI/Java 包装文件内容未变化，无须产生差异；工作区原有其他修改均保留。WorkbenchView.spec.ts 的旧 State 位置断言同步上一轮已实施的避让规则。
