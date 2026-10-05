# Spec: OPM P03 State 直接创建与 Feature 默认收起

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 目标

1. 画布首次加载以及新建 Attribute/Operation 后，拥有 Feature 的 Object/Process 默认处于收起状态。
2. State 工具仅在当前选择为 Object 且 Runtime 返回可用 `CREATE_STATE` option 时启用。
3. 点击 State 工具后直接创建该 Object 的 State，不再进入二次放置或创建候选表单。
4. 新 State 使用同 owner 下递增的默认名称 `State N`，默认角色为空，并按现有 owner 内布局规则排列。
5. State 创建后继续使用现有 State 右侧检查器编辑名称和角色；该检查器的字段与保存按钮保持不变。

## 2. 非目标

- 不修改 OpenAPI、HTTP 路由、Runtime `CREATE_STATE/UPDATE_STATE` 语义、数据库 schema、依赖或配置。
- 不允许 Attribute/Operation 作为新 State 的 UI 创建 owner；既有 Feature State 仍可被投影、查看和编辑。
- 不新增 State 画布双击名称输入层；名称编辑继续使用现有 State 右侧检查器。
- 不持久化 Feature 展开/收起状态，不为折叠产生命令或 Revision。
- 不改动 State 右侧检查器中的名称、角色、保存、显式/抑制及展开/折叠功能。

## 3. 允许与禁止范围

允许修改：

- `specs/opm-p03-direct-state-creation-and-default-feature-collapse-task-spec.md`
- `specs/opm-p03-direct-state-creation-and-default-feature-collapse-checklist.md`
- `apps/web/src/stores/workbench/constructEditing.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchInspector.vue`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-attribute-owner.spec.ts`
- `tests/e2e/workbench-owned-layout.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `tests/e2e/workbench-direct-state-and-default-collapse.spec.ts`
- `docs/design/opm-complete-canvas-toolchain-design.md`

禁止修改公共契约、后端、数据库、依赖、路由、全局配置、Profile/Golden/Release、`runtime-data/**` 和上述清单外文件。

## 4. 交互决策

Feature 折叠状态仍由 `OpdCanvas` 本地持有。组件初始化时，把所有拥有 Attribute/Operation 的 owner 加入折叠集合；投影中新 owner 首次出现或 owner 的 Feature 数量增加时，该 owner 进入收起状态。用户点击 `+` 后可展开；后续普通 Projection 刷新不覆盖用户对未变化 owner 的本地选择。刷新页面或重建画布重新回到默认收起。

State 工具点击后直接提交现有 `CREATE_STATE` payload：`owner_ref.target_kind=ELEMENT`，owner 为当前 Object；`name_or_value=State N`；`state_roles=[]`；`construct_role=STATE_NODE`；位置为 owner 内 `x + 36`、`y + 32 + existingStateCount * 34`。提交期间沿用现有命令状态和错误反馈，不展示临时候选表单。

## 5. 验收项

- `DIRECT-STATE-01`：无选择、Process、Attribute、Operation 或 State 选择时 State 工具禁用且不查询/提交 Feature State 创建。
- `DIRECT-STATE-02`：选择 Object 且 option 可用时，点击一次 State 工具直接提交唯一 `CREATE_STATE`，默认名称、空角色、owner 和布局正确。
- `DIRECT-STATE-03`：创建流程不再展示 `p03-state-candidate`、名称候选输入、“取消”或“创建”按钮。
- `DIRECT-STATE-04`：现有 State 右侧检查器保持可用，名称和角色仍通过 `UPDATE_STATE` 保存。
- `FEATURE-COLLAPSE-01`：已有和新建 Attribute/Operation 默认隐藏，owner 显示 `+`；点击后展示 Feature、所属线和 Feature State。
- `FEATURE-COLLAPSE-02`：展开/收起仅影响本地画布，不产生命令或 Revision。
- `DIRECT-VERIFY-01`：Vue 定向与全量测试、ESLint、typecheck、build 和 Playwright 主路径通过，并完成桌面/窄视口视觉检查。

## 6. 验证

先运行 `OpdCanvas.spec.ts` 与 `WorkbenchView.spec.ts`，再运行 Web 全量单元测试、ESLint、typecheck 和 build。使用独立 Playwright 场景验证 Feature 默认收起、Object-only State 工具、单击直接创建、State 右栏改名，以及桌面和窄视口布局。

## 7. 回滚

回退本规格允许文件即可恢复旧的 Feature 默认展开和 State 候选创建流程。没有 schema、持久化格式或数据迁移需要回滚。
