# Spec: OPM P03 Attribute Owner 连线与折叠交互

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

三个 playbook 不可拆分：同一个 Feature owner 需要从 Spring Runtime 投影到 Vue 画布，并通过跨层测试验证。

## 1. 目标

1. 用户选中 Object 后创建 Attribute，Runtime Projection 返回该 Attribute 的既有 owner Element 标识。
2. 画布使用 owner 标识在 Object 与其 owned Attribute 之间绘制非语义、无方向的所有权连线。
3. Object 拥有 Attribute 时，通过 Object 内的 `-/+` 控件在当前画布会话内切换这些 Attribute 及其所有权连线的展开/收起状态。
4. 创建后的 Attribute 默认可见，刷新后仍能从 Projection 重建 owner 连线。

## 2. 非目标

- 不新增或修改 HTTP 字段、OpenAPI schema、数据库 schema、依赖或路由。
- 不改变 `CREATE_FEATURE` 命令、Feature owner 语义、Revision、OPL、Trace 或保存行为。
- 不把 Attribute 展开/收起映射为 State 的 `FOLD/UNFOLD` 语义命令，不持久化该瞬时视图状态。
- 不将所有权连线建模为 Fact，不允许其参与选择、删除、关系编辑或 capture anchor。
- 不改变 Operation、State、普通 Fact 的显示与交互。

## 3. 允许与禁止范围

允许修改：

- `specs/opm-p03-attribute-owner-link-and-collapse-feature-task-spec.md`
- `specs/opm-p03-attribute-owner-link-and-collapse-feature-checklist.md`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdProjectionQuery.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `tests/e2e/workbench-attribute-owner.spec.ts`
- `docs/design/opm-complete-canvas-toolchain-design.md`

禁止修改上述清单外的文件，尤其 `runtime-data/**`、数据库 migration、生成契约、Profile/Golden/Release 资产、依赖和全局配置。

## 4. 契约影响

`ProjectionConstruct.owner_id` 已是可选公共字段。本任务不改变 wire shape，只规定当 construct 的 `target_kind=FEATURE` 时，Runtime 必须从该 Feature 的 `owner_element_id` 填充 `owner_id`。Attribute 和 Operation 均遵守该投影规则；本任务新增的画布连线与折叠只作用于 Attribute。

所有权连线是表现层装饰 Cell：无 occurrence capture anchor、无 relation ID、无箭头，不能上送任何命令。折叠集合由 `OpdCanvas` 局部持有；切换 Context、重建组件或刷新页面后恢复默认展开。

## 5. 验收项

- `ATTR-OWNER-01`：Feature Projection 返回语义模型中的 exact owner Element ID，且既有字段和值不变。
- `ATTR-OWNER-02`：带合法 `ownerId` 的 Attribute 默认显示一条 Object-Attribute 装饰连线；缺失或无效 owner 时不绘制悬空连线。
- `ATTR-OWNER-03`：点击拥有 Attribute 的 Object 内 `-/+` 控件后隐藏其 owned Attribute 和所有权连线，再次点击恢复；无 Attribute 的 Object 不显示该控件，也不进入预折叠状态。
- `ATTR-OWNER-04`：折叠只影响当前画布表现，不提交命令、不产生 Revision，不改变普通关系和其他 owner 的 Attribute。
- `ATTR-OWNER-05`：Java 定向测试、Vue 组件测试、前端 typecheck/build 与差异检查通过；无法执行的验证必须记录原因。

## 6. 验证

先执行 `LocalApiServiceTest` 和 `LocalApiControllerTest` 的相关测试，再执行 `OpdCanvas.spec.ts`。随后执行前端 typecheck/build，并按仓库当前 Git 元数据能力执行差异检查。浏览器手工验证：选择无 Attribute 的 Object、创建 Attribute、观察连线、连续点击 Object 验证收起和展开。

## 7. 回滚

回退本规格允许文件即可恢复旧投影和画布行为。没有 schema 或持久化数据变更，不需要数据回滚；已创建 Feature 保持原语义 owner。
