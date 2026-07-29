# Spec: OPM P03 图标工具栏与关系目录

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 背景

当前 P03 工具栏将所有动作渲染为文字按钮，只暴露 Object、Process 与 Consumption 三个建模入口。这与完整画布工具链设计的图标化固定分组、Object/Process/State 快捷入口，以及 16/8/10 关系目录不一致。

当前 P0 Mock 只具有 Object、Process 与 Consumption 的本地候选能力；State 与其余关系尚未具备 `DEV-CANVAS-00` 所需的机器契约、符号资产、规则、文本和提交闭环。

## 2. 目标

1. 将 P03 通用工具替换为带可访问名称和 tooltip 的 Lucide 图标按钮。
2. 将 Object、Process、State、Relation 呈现为 OPM 领域工具入口；State 使用不可用原因明确其后端命令未接入。
3. 增加可搜索的关系目录，按过程、控制、结构三组呈现 16/8/10 Capability；仅 Consumption 可调用当前 P0 Mock 候选，其他项显示稳定不可用原因。
4. 保持桌面和移动工具栏可用、可横向滚动，不挤压画布。
5. 为图标、目录分组、搜索、可用 Consumption 和不可用 State 补充页面级与 E2E 回归覆盖。

## 3. 非目标

- 不接入真实后端、OpenAPI generated client、SSE、数据库或本地文件运行时。
- 不修改 OpenAPI、JSON Schema、数据库 schema、Profile/Rule/Grammar/Symbol Catalog 资产。
- 不实现 State 创建、16/8/10 关系的候选、提交、OPL、Trace 或 X6 生产符号。
- 不修改 P04-P06 页面、路由或全局视觉主题。

## 4. 范围

### 包含范围

- `apps/web/package.json`、根 `package-lock.json`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/shared/api/mock/**`
- `apps/web/src/shared/types/**`
- `apps/web/src/shared/styles/base.css`
- `tests/e2e/workbench-layout.spec.ts`
- 本规格与 checklist。

### 不包含范围

- `services/**`、`docs/contracts/**`、数据库、OpenAPI、Profile/Rule/Grammar/Symbol Catalog 包。
- 既有 P03/P04 任务规格和 checklist。

## 5. 设计输入

- `docs/design/opm-complete-canvas-toolchain-design.md` 第 3 至 5、14、15、17、18 章。
- `docs/design/opm-frontend-handoff.md` 第 5 节。
- `docs/design/opm-development-execution-pack.md` 第 5.2 节。
- `docs/design/opm-modeling-workbench-component-interaction.md` 的完整画布组件边界。

## 6. 方案约束

1. 通用工具仅使用新增且精确锁定版本的 `lucide-vue-next`；不使用生成图片或手写 SVG。
2. Object/Process/State 只作为设计确认缩略入口，不冒充已加载的生产 Symbol Catalog 资产。
3. 关系目录由 Mock adapter 提供展示数据，页面和 Pinia 不硬编码关系 Capability 合法性；可用状态必须明确标识为 P0 Mock。
4. 未接入能力通过 `aria-disabled`、tooltip 和状态提示解释，不能静默失效或伪装为已提交命令。
5. 保留既有稳定 `data-testid`；新增标识遵循完整画布设计第 17 章。
6. 关系目录为普通前端菜单，打开时焦点进入搜索框，关闭后回到触发按钮。

## 7. 接口、数据与状态影响

- 不新增或修改后端接口、OpenAPI、数据库数据或正式 Revision。
- 新增前端本地菜单开关、搜索词和 Mock 关系目录展示数据；这些均不进入 URL 或 Revision。
- 既有 Object、Process、Consumption Mock 交互保持兼容。

## 8. 风险与回滚

- 风险：工具栏项目增多后可能在窄屏覆盖画布；以固定图标尺寸、横向滚动及移动 E2E 防回归。
- 风险：目录展示被误认为完整能力已可用；每个未接入项必须展示不可用原因。
- 回滚：移除本任务引入的 Vue、Mock、样式、测试和依赖锁定修改；不涉及数据迁移或外部系统回滚。

## 9. 验收与验证

1. 通用工具均为 32 x 32px 图标按钮，具备 `title` 与 `aria-label`。
2. Object/Process/State/Relation 均可见；State 明确提示尚未接入 State 命令。
3. 关系目录可搜索，并呈现过程 16 项、控制 8 项、结构 10 项；Consumption 是唯一可用关系。
4. 点击 Consumption 仍能创建既有 Mock Consumption 候选；点击不可用项不创建候选并显示原因。
5. 菜单焦点进入搜索框，关闭后焦点恢复触发按钮。
6. `npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:e2e`、`npm run build` 通过。
7. 在 `1440x1000` 和 `390x844` 下工具栏不与画布重叠；移动端可横向访问所有工具。
