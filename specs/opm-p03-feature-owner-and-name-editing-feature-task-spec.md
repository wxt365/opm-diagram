# Spec: OPM P03 Feature Owner 与名称编辑

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

三个 playbook 不可拆分：同一 Feature 能力需要扩展公共命令契约、Spring Runtime 与 Vue 画布交互，并由跨层测试验证。

## 1. 目标

1. Attribute 与 Operation 使用现有右侧属性面板编辑名称，并保留画布双击名称编辑能力。
2. 用户选中已有 Process 后创建 Operation，新 Operation 使用该 Process 作为 owner，并在画布上显示非语义、无方向的所属连接。
3. Object/Process 通过节点内 `-/+` 控件展开或收起各自拥有的 Feature；收起同时隐藏 Feature 拥有的 State 以及涉及隐藏节点的普通关系。
4. 扩展 `UPDATE_PROPERTY`，使 Element 与 Feature 使用同一名称规则、能力查询和 Revision 提交流程。

## 2. 非目标

- 不修改数据库 schema、HTTP 路由、依赖、全局配置、Profile/Rule/Grammar/Symbol 或发布资产。
- 不改变 `CREATE_FEATURE` 的 owner 语义，不把所属连接建模为 Fact。
- 不持久化展开/收起状态，不为折叠提交命令或产生 Revision。
- 不允许 State、Fact 或 Context 通过 `UPDATE_PROPERTY` 改名。
- 不新增名称唯一性、自动 trim、大小写折叠或 Unicode 规范化规则。

## 3. 允许与禁止范围

允许修改：

- `specs/opm-p03-feature-owner-and-name-editing-feature-task-spec.md`
- `specs/opm-p03-feature-owner-and-name-editing-feature-checklist.md`
- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `scripts/generate-api-edt-contracts.mjs`
- `apps/web/src/shared/api/generated/apiEdtContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticCommandEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticElementEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/CommandCapabilityOptions.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/test/**`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchInspector.vue`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/opd/useCanvasNameEditor.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-attribute-owner.spec.ts`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-modeling-tool-application-api-contract.md`

禁止修改上述清单外文件，尤其是 `runtime-data/**`、数据库 migration、依赖、路由、Profile/Golden/Release 资产和全局配置。

## 4. 契约影响

`UPDATE_PROPERTY.target_ref.target_kind` 从常量 `ELEMENT` 扩展为封闭枚举 `ELEMENT | FEATURE`；payload 其余字段和 HTTP 路由不变。`property_name` 仍固定为 `name`。Object/Process 使用 `ELEMENT`，Attribute/Operation 使用 `FEATURE`。

Feature 名称执行既有名称规则：输入必须是 JSON string；按 Java `String.isBlank()` 判断非空白；长度为 `1..256` Unicode code points；原字符串原样保存；允许重名；与当前名称逐字相同时拒绝。成功改名仅替换 `QualifiedName.localName`，稳定 ID、owner、kind、capability、source、normalization、layout、State 所属以及非目标集合保持不变。

能力查询必须为当前 Context 中可见的 Attribute/Operation 返回可用 name option；历史 Revision 继续遵守既有只读/过期规则。Draft 命令候选与应用必须同时校验 target kind 和 target id，防止 Element/Feature 同 ID 混淆。

## 5. 画布交互

所属连接是表现层装饰 Cell：无箭头、无 capture anchor、不可选择、不可删除、不提交命令。Attribute 连接 Object owner，Operation 连接 Process owner；owner 缺失、类型不匹配或不可见时不绘制悬空连接。

Object/Process 仅在拥有可见 Feature 时显示 `-/+` 控件。点击控件切换该 owner 的本地折叠状态；普通节点点击仍只负责选择。收起后隐藏 owned Feature、这些 Feature 拥有的 State、所属连接以及触及隐藏节点的普通关系。新建 Feature 时自动展开其 owner。切换 Context、组件重建或刷新页面后恢复默认展开。

现有 `ElementNameProperty` 作为统一名称编辑面板，支持 Object、Process、Attribute、Operation，不新增右侧面板。四类节点均可双击打开现有 HTML input 覆盖层，并沿用 Enter、Escape、blur、IME、失败保留和成功后按 committed Revision 重读的既有行为。

## 6. 验收项

- `FEATURE-NAME-01`：OpenAPI、生成 DTO 和 Draft schema 对 `UPDATE_PROPERTY` 使用唯一封闭 payload，`target_kind` 精确支持 `ELEMENT | FEATURE`。
- `FEATURE-NAME-02`：Runtime、能力查询和 Draft 路径可重命名 Attribute/Operation，并保持 Feature 身份、owner、kind、能力、布局、State 所属、OPL 和 trace 一致。
- `FEATURE-NAME-03`：非法 kind/id、过期 option、空白、超过 256 code points 和同名请求被拒绝且零写入。
- `FEATURE-UI-01`：现有右侧属性面板可编辑 Object/Process/Attribute/Operation 名称，不再显示 Feature 不支持编辑提示。
- `FEATURE-UI-02`：Attribute/Operation 双击可使用现有画布名称输入层编辑。
- `FEATURE-OWNER-01`：选中 Process 创建 Operation 后，Operation 以该 Process 为 owner 并显示装饰所属连接。
- `FEATURE-OWNER-02`：Object/Process 的 `-/+` 控件正确收起和展开 owned Feature；状态仅属当前画布，不产生 Revision，新增 Feature 自动展开 owner。
- `FEATURE-VERIFY-01`：契约检查、Java/Vue 定向测试、前端 typecheck/build 和 Playwright 主路径通过；无法执行项记录原因。

## 7. 验证

先执行契约生成与检查、Runtime 定向单元/MVC 测试、Vue 定向测试，再执行前端完整测试、typecheck/build。最后使用 Playwright 验证 Attribute/Operation 右侧改名、双击改名、Process-Operation 所属连接和折叠，并按当前 Git 元数据能力执行差异或等价静态检查。

## 8. 回滚

回退本规格允许文件即可恢复旧契约、运行时和画布行为。没有数据库迁移或持久化视图状态需要回滚；已提交的 Feature 名称 Revision 保持可读取，不做破坏性删除。
