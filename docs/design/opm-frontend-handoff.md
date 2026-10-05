# OPM 单机建模工具前端交付标注

文档版本：`v1.13`

文档状态：`FROZEN_INCLUDED`；P0 与完整画布前端 handoff 冻结，联调仍受机器契约 Gate 约束

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-09-11

## Task Type

- `feature`

## 1. 文档目的

本文档把 P01-P06 页面设计、状态模型、字段、组件交互、OpenAPI、完整画布设计和已验收原型收敛为前端实现 handoff。P0 生产范围仍只包括 P01-P03 与工作台中的最小校验、版本和基线入口；State 与完整关系按 `DEV-CANVAS-00~06` 增量进入，不反向扩大 P0。

## 2. 关联输入

1. `opm-modeling-workbench-page-design.md`
2. `opm-modeling-workbench-state-model.md`
3. `opm-modeling-workbench-field-region-detail.md`
4. `opm-modeling-workbench-component-interaction.md`
5. `opm-modeling-tool-application-api-contract.md`
6. `opm-complete-canvas-toolchain-design.md`
7. `opm-symbol-and-text-generation-implementation-contract.md`
8. `opm-prototype-acceptance-report.md`
9. `docs/contracts/openapi/opm-local-api-v1.yaml`
10. `prototype/index.html`、`prototype/styles.css`、`prototype/app.js`
11. `opm-opd-node-renderer-architecture.md`

## 3. 交付范围

### 3.1 P0 生产实现

1. P01 项目库：列表、搜索、创建项目、打开项目；
2. P02 项目详情：模型列表、创建模型、打开模型；
3. P03 建模工作台：五区、Object/Process/Consumption、视口缩放、属性编辑、OPL、Finding 和只读基线；
4. OV01、OV02、OV03、OV05、OV06、OV11 的 P0 子集；
5. 校验任务与任务查询、Revision 列表和基线创建入口；
6. loading/empty/error、editable/readonly、submitting/blocked/save-failed、text current/stale/blocked、validation stale/running/current/failed。

### 3.2 本轮已设计但不进入 P0 生产实现

1. P04 独立版本比较页；
2. P05 完整 Capability/Rule/Conformance 工作台；
3. P06 导入、导出、备份和恢复页面；
4. OV04、OV07-OV10；
5. State 创建/更新、State-specified 端点与完整状态工具；
6. 16 类 Procedural、8 类 Control 组合和 10 类 Structural 的生产工具栏启用；
7. 关系搜索目录、structural fan、双标签、控制修饰和完整性编辑；
8. 完整方法工作台、跨配置档转换和本体发布。

上述第 5~7 项已具备设计 handoff，但必须先完成 `DEV-CANVAS-00` 的 OpenAPI/Schema 闭环。当前草案虽已出现 State/Fact union 和结构化 option，仍缺 Control/base Fact 分字段、Modifier 原子约束和 Revision Fact 承载，不能以部分 DTO 直接进入联调。

## 4. Screen 与页面映射

| 一级入口 | 原型 screen | 原型节点 | page_id | route |
| --- | --- | --- | --- | --- |
| 项目 | 项目库 | `[data-page="P01"]` | P01 | `/projects` |
| 模型 | 项目详情 | `[data-page="P02"]` | P02 | `/projects/:projectId` |
| 工作台 | 建模工作台 | `[data-page="P03"]` | P03 | `/projects/:projectId/models/:modelId/workbench` |
| 版本 | 版本与基线 | `[data-page="P04"]` | P04 | `/projects/:projectId/models/:modelId/versions` |
| 校验 | 标准与校验 | `[data-page="P05"]` | P05 | `/projects/:projectId/models/:modelId/conformance` |
| 本地数据 | 本地数据 | `[data-page="P06"]` | P06 | `/projects/:projectId/local-data` |

原型 `data-*` 只用于 handoff 定位，不要求生产 DOM 继承。生产 E2E 应使用稳定 `data-testid`，命名采用 `pageId-area-action`，不得依赖中文文案或 CSS 层级。

## 5. 工程结构与边界

```text
apps/web/src/
  app/                         router、shell、bootstrap
  modules/projects/            P01/P02、project/model query
  modules/workbench/           P03、X6 adapter、workspace stores
    opd/core/                   Node/Relation Definition、RenderSpec、registry、X6 adapter
    opd/nodes/                  Object/Process/State/Attribute/Operation Definition
    opd/relations/              16 Procedural、8 Control Decorator、10 Structural Definition
    opd/editors/                名称、State、Relation 独立 Editor
  modules/versions/            P04 与版本复用区块
  modules/conformance/         P05 与 Finding/Task 复用区块
  modules/local-data/          P06
  shared/api/                  OpenAPI generated client
  shared/components/           无业务语义的视觉组件
  shared/state/                local session 与后台 task registry
  shared/styles/               Element Plus 主题与 design tokens
```

1. 页面不得自行拼 URL，全部 DTO 和 client 从 OpenAPI 生成；
2. `shared/components` 不依赖 OPM 业务模块；
3. OPM Command、Capability、Rule、端点归一化和 OPL 不在前端实现；
4. `workbench/x6` 只负责 Projection <-> Cell ViewModel 和用户意图适配；
5. Pinia 只保存 route/query/local view/resource/editor/projection/task 状态，服务器 Revision 是正式状态；
6. 原型不进入生产构建。
7. 通用工具图标采用 Lucide，OPM 领域图标必须来自 Symbol Catalog；当前前端未直接依赖 Lucide，后续前端任务规格必须显式允许并冻结准确依赖版本，或通过现有图标库 ADR 给出等价替代。
8. 应用 bootstrap 在任何项目查询或编辑器写命令前执行冻结浏览器矩阵和必需 Web API 检查；不支持时只渲染兼容性阻断页。
9. 每种内置节点使用独立 Definition 文件，通过显式 registry 和共享 X6 adapter 装配；Node 只表示表现层图元，不改变领域 Element/State/Feature 分类；不使用 Vue 类继承、每实例文件或运行时插件扫描。
10. Relation Registry 以基础 `capability_id` 精确注册 16 Procedural + 10 Structural，Control Decorator Registry 以 `control.capability` 注册 8 项；family 不是 production 最终查找键。
11. Definition 只产生纯 RenderSpec，Editor 只产生用户意图；Runtime Capability Option 和 committed Revision 仍是允许性与正式状态的唯一来源。
12. 后继迁移必须保持 capture anchor、`data-testid`、名称编辑、visual/E2E 和性能契约，并以 occurrence 稳定键增量调和替代正常更新中的全量清空。

## 6. 全局实现口径

### 6.1 导航与恢复

1. P03 route 只保存 project/model/context 和 Revision 定位模式：活动草稿 canonical URL 省略 `revision`，精确历史/Snapshot/Baseline/永久链接使用 `revision=<revision_id>`；
2. `revision=head` 仅为兼容输入，进入后用 replace 规范化为省略 `revision`，不得形成第二种 canonical HEAD URL；
3. Header 始终显示实际 committed Revision；HEAD 下命令成功只更新 Header、编辑基线和 Projection，不改 URL、不新增 history entry；
4. viewport、选择、拖拽候选、未提交表单、工具、菜单、弹层、属性/底部面板状态和临时高亮不得进入 URL 或 history state；
5. P03 -> P04/P05 回流可在会话内保存 Context、稳定选择、底部标签和 viewport bookmark，但只有 Context 进入 URL；
6. 刷新、前进和后退只恢复 Context 及 HEAD/EXACT 资源定位，不重复命令或恢复临时画布状态；
7. Snapshot/Baseline/历史 Revision 的 EXACT route 强制只读；返回活动草稿或创建草稿后切换为 canonical HEAD URL；
8. 非法或跨 Model 的精确 Revision 必须拒绝且不得回退 HEAD；缺失/非法 Context 在目标 Revision 内解析根 Context并规范化；
9. 复制永久链接以 Header 当前实际 committed Revision 生成 EXACT URL；不得复制 HEAD URL 冒充永久链接；
10. 布局命令是否产生 Revision 与 URL 策略独立，即使产生新 Revision，HEAD URL 仍不改变。

### 6.2 数据来源与一致性

1. Context、Text、Validation 都校验 `read_revision/input_revision`；
2. 只有同 Revision、Profile、Rule 的投影可以显示 current；
3. Command 成功后采用服务器 `committed_revision` 和新投影，不本地拼正式模型；
4. `ACCEPTED` 只表示任务登记，完成必须查询 Task；
5. SSE 只做提示，断线或重连后以 API-TSK-001 为准。

### 6.3 视觉与响应式

| 项目 | 冻结值/口径 |
| --- | --- |
| Header | 桌面 56px；移动两层，入口 3x2 |
| P03 桌面列 | 230px / minmax(500px, 1fr) / 270px |
| P03 底部 | 默认 240px，可折叠/调整 |
| Panel/Card radius | 不超过 8px |
| Workbench breakpoint | `<=820px` 单列降级 |
| Compact breakpoint | `<=520px` 表单、摘要、设置单列 |
| 画布 | 主区域可内部水平/垂直滚动；页面本身不横向溢出 |
| 固定控件 | toolbar、缩放、图元、marker 使用稳定尺寸 |

生产 Element Plus 主题以原型 token 为视觉方向，不复制原型 CSS。颜色不是状态唯一信号；状态使用图标/文字/轮廓组合。

### 6.4 受限态

1. disabled 控件必须提供可访问原因或旁侧说明；
2. `blocked` 保留候选输入和规则定位；`failed` 提供重试/诊断；
3. `save-failed` 禁止快照、基线和正式导出；
4. `readonly-baseline` 禁用全部语义写入，但视口、查看、定位、比较、导出和建草稿可用；
5. 符合性缺实现或证据时显示 unknown/evidence-missing，禁止映射为 partial/full。

## 7. P0 页面逐项标注

### 7.1 P01 项目库

- 状态：`loading/ready/empty/error`、`active/archived`、search/cursor；
- 接口：API-PRJ-001、API-PRJ-003；
- 主动作：创建、打开、搜索；
- 回流：创建后 P02；列表刷新保持筛选；
- P0 不做：归档/恢复实现、真实导入。

### 7.2 P02 项目详情

- 状态：project/model resource、open workspace、OV02；
- 接口：API-PRJ-002、API-PRJ-006、API-PRJ-007、API-PRJ-009；
- 主动作：创建模型、打开模型；
- 回流：创建或打开后 P03；关闭工作台返回原列表位置；
- P0 不做：Profile 转换提交。

### 7.3 P03 建模工作台

- 状态：第 8 章 store 切片；
- 接口：API-CTX-001/002、API-EDT-001/002、API-TXT-001、API-VAL-001、API-TSK-001/004、API-VER-001/004；
- 主动作：创建 Object/Process/Consumption、属性提交、视口缩放、语义缩放、校验、基线、Finding 定位；
- 回流：Context/selection/text/findings 双向稳定定位；
- P0 不做：完整关系菜单、复杂自动布局、方法写入。

### 7.4 P03 完整画布增量 handoff

| 区域 | 组件 | 输入 | 输出/事件 | 守卫 |
| --- | --- | --- | --- | --- |
| 工具链 | `editor-toolchain` | Profile/Symbol binding、access mode | tool mode | 只保存本地工具状态 |
| State 工具 | `tool-create-state` | owner selection、State capability option | `state-create-requested` | 无合法 owner 时禁用 |
| 主工具栏内关系工具组 | `relation-tool-palette` | selection-aware 16/8/10、interaction mode、exact symbol descriptor、endpoint summary、reason | 高频直达或族目录选择后 arm create/query Control | 与画布工具同排；`5/4/5` 高频纯图标、竖线分组、三组完整纯图标目录、标准双语 tooltip 与可读禁用原因；机器端点/reason 不进入 tooltip，不硬编码 allowed/endpoint rules，不提供未知 Symbol fallback |
| 候选层 | `editor-candidate-layer` | normalized endpoints、exact descriptor、RelationPreviewRenderSpec | add endpoint/confirm/cancel | 不写 context-projection/anchor/OPL/Trace |
| State 检查器 | `inspector-state-fields` | State DTO、role options、trace | candidate changed | owner 只读 |
| Relation 检查器 | `inspector-relation-fields` | Fact/endpoints/labels/modifiers | requery/update candidate | 先重算再提交 |
| 构造生命周期 | `editor-construct-actions-menu` | selected occurrence、impact option、Control remove option、pointer anchor? | open properties / impact query/direct submit/cancel | 右键首项打开属性且零 Revision；删除项仍由 Runtime 驱动；键盘无菜单并按固定优先级提交 |
| 属性检查器 | `inspector-properties-dock` | selection、rightPanel.open、candidate task state | open/close local view state | 默认不渲染且不占第三列；右键首项或工具栏图标打开；关闭保留 selection；候选任务可强制显示右侧区 |
| 命令反馈 | `editor-command-feedback` | submitting/blocked/conflict/failed | retry/cancel/locate | 不把 committed 当 saved |

基础关系候选状态必须使用 `idle/relation-armed/dragging/endpoint-selected/candidate-filtering/candidate-preview/confirmed/cancelled`；提交中的异步反馈继续使用公共 `submitting/blocked/failed`。Control 使用 selected committed Procedural Fact 的独立 `UPDATE_FACT` preview，不进入拖线。State 使用 `unavailable/ready/placing/editing/preview/submitting/blocked/failed/committed`。字段、转换和错误恢复以 `opm-complete-canvas-toolchain-design.md` 为唯一专题基线。

稳定测试入口：

1. `P03-canvas-toolchain`；
2. `P03-tool-object/process/state`；
3. `P03-relation-tool-palette`、`P03-relation-toolbar-{family}`、`P03-relation-menu-toggle-{family}`；
4. `P03-relation-quick-option-{capabilityId}`、`P03-relation-menu-option-{capabilityId}`；
5. `P03-relation-candidate`、`P03-command-feedback`；
6. `P03-inspector-state-*`、`P03-inspector-relation-*`。
7. `P03-construct-actions-menu`；直接删除不再存在确认弹层测试入口。
8. `P03-right-panel`、`P03-right-panel-open`、`P03-right-panel-close`、`P03-construct-open-properties`。

## 8. Store 切片

| Store | 正式字段 | 禁止拥有 |
| --- | --- | --- |
| `route-context` | project/model/context/page、HEAD/EXACT 模式及 EXACT revision | 实际 HEAD Revision、未提交表单、viewport/selection/tool/panel 状态 |
| `workspace-resource` | session、Profile binding、access mode | Semantic Model 副本 |
| `editor-session` | base revision、candidate、submit、undo/redo availability | 领域规则 |
| `capability-options` | query id、base revision、结构化 option、reason、impact summary/token、expiry | 自定义 Capability 判定或 impact token 拼装 |
| `context-projection` | nodes/edges/layout/read revision | X6 作为正式模型 |
| `view-state` | viewport、selection、panel、active tab | Revision/Fact |
| `text-projection` | artifact、trace、freshness | 可编辑正式文本 |
| `validation` | report/finding/task/freshness | 自动修复事实 |
| `task-registry` | task state/stage/progress/result | 假定事件可靠 |

## 9. X6 交付口径

1. P0 自定义 Object/Process node 与 Consumption edge 读取 Symbol Catalog；完整画布增量加入 State、16/8/10 relation descriptor；
2. Cell metadata 仅保存 occurrence/target/symbol/layout 引用；
3. owned Object、Process、Attribute、Operation、State Cell 拖动结束上送一条 `UPDATE_LAYOUT`；State 限制在 owner 内容区，owner 拖动实时带动状态和装饰，Runtime 原子保存联动布局。Fact 和装饰 Cell 不可独立提交该命令。详见 `opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md`；
4. 服务器提交成功后全量或增量替换 Projection；失败恢复已提交视图；
5. viewport 事件只更新 `view-state`，绝不调用 API-EDT-002；
6. semantic zoom 先弹影响确认，再以明确 command_type 提交；
7. 图文高亮由 Text Trace 驱动，不按名称查找。
8. State 是 owner 内的独立投影 construct，不映射为 Element node；拖出 owner 不能提交布局。
9. Fundamental Structural fan 映射为一个 Fact + junction + branches，不能拆成多条正式 binary Fact。
10. Event/Condition 使用基础 edge 的 annotation，不复制重叠 edge；只读取 `control.capability/control.segment` pair，Effect 只修饰输入 segment。
11. 完整 marker、label slot 和 route family 只由 Symbol Descriptor 驱动，不在 Vue/X6 adapter 按 Capability 写条件分支绘图。
12. 关系 gesture adapter 只输出 `relation-drag-start/relation-drag-move/relation-endpoint-selected/relation-cancelled`；事件使用 exact occurrence ID，不携带 role、direction 或 Command payload。
13. pointer drag 临时线在释放时删除；option 选定后由 Capability Definition 生成无 committed identity/capture anchor 的 `RelationPreviewRenderSpec`，26 个基础 Capability 均须确认后才能提交。
14. fan 继续添加端点、Self-invocation 重复 Process occurrence 和 State-specified exact State occurrence均由 Store 状态与 Runtime normalization闭合；X6 不判断合法性。
15. 同一无向端点对上的普通二元关系由独立纯布局步骤以 `24px` 间距稳定分轨；fan、Effect、自调用和已有显式 route 不覆盖。X6 原位更新必须同步增加或清除折点。
16. 关系工具与选择/平移、构造创建、缩放/适配位于同一排主工具栏，以竖线分隔并常驻 `5/4/5` 个高频标准图标；组尾箭头按 Runtime 原序展开完整纯图标 `16/8/10`，一次只开一组，外部点击、Escape 或选择后关闭。关系区不显示名称或数量，全部按钮以“中文标准名称 / English standard name”的 `title/aria-label` 提供双语提示，禁用时只追加可读原因。常驻按钮/符号为 `34 x 32px / 32 x 18px`，下拉符号为 `42 x 20px`，四列浮层最大 `256px`。窄屏由整条主工具栏横向滚动，固定目录浮层不被裁剪；画布内容最小高度 `360px`，较矮视口必须能滚动到节点。当前不得装配或持久化用户编辑的关系 vertex。

## 10. 接口映射总表

| 页面/状态 | operationId | 作用 |
| --- | --- | --- |
| P01 ready | API-PRJ-001 | 项目分页 |
| OV01 | API-PRJ-003 | 创建项目 |
| P02 header | API-PRJ-002 | 项目摘要 |
| P02 models | API-PRJ-006/007/009 | 模型列表、创建和打开 |
| P03 bootstrap | API-CTX-001/002 | 导航和 OPD Projection |
| P03 command menu | API-EDT-001 | Profile 过滤的可用命令 |
| P03 editing | API-EDT-002 | 原子语义命令 |
| P03 State/complete relation candidate | API-EDT-001 扩展 | 结构化 option、规范端点、Control/base Fact Capability、symbol/template/rule refs、reason；删除时返回 impact summary/token |
| P03 construct lifecycle | API-EDT-001/002 后继扩展 | exact selection、删除模式、完整 impact、opaque token 与 Control modifier removal；同一原子包生成 client/Runtime/Vue/E2E |
| P03 State/complete relation submit | API-EDT-002 扩展 | `CREATE_STATE/UPDATE_STATE/CREATE_FACT/UPDATE_FACT`；删除命令携带未过期 impact token |
| P03 text | API-TXT-001 | OPL 与 Trace |
| P03 validation | API-VAL-001 | 固定 Revision 校验 |
| P03 task | API-TSK-001/004 | 任务查询与 SSE |
| P03 versions | API-VER-001 | Revision 选择 |
| OV06 | API-VER-004 | 基线门槛与创建 |

### 10.1 Control 候选与提交映射

1. `CommandCapabilityOption.capability_ref` 表示所选 `CAP-ISO-CTRL-001~008`；`base_fact_capability_ref` 表示被修饰的基础 Procedural Capability，二者不得互换；
2. `CreateFactPayload.capability_ref` 和 `UpdateFactPayload.expected_capability_ref` 始终使用基础 Fact Capability，不写 Control Capability；
3. wire payload 只提交 `{modifier_id,value}`。Control option 必须提供同一 `atomic_group_id=iso-control` 的 `control.capability=<option.capability_ref>` 与 `control.segment=PROCESS_INPUT`，前端不得提交或缓存派生的 Modifier `target_ref/capability_ref`；
4. 新建基础 Fact 时在一次 `CREATE_FACT` 中提交 pair；修饰既有基础 Fact 时使用 `UPDATE_FACT.replacement.modifiers` 原子替换，并携带该 Fact 其余仍需保留的 Modifier；不得先提交半对再补齐；
5. committed Projection 继续以基础 `fact_id` 和一个 X6 edge 为身份。pair 只驱动输入段 `e/c` annotation、OPL 和 Trace；`condition` 仅显示/编辑独立谓词；
6. 缺项、重复项、非法值、Control/base Capability 不匹配或过期 option 时，保留最近 committed Projection，清除候选 annotation，并按 `MODIFIER_COMBINATION_INVALID/REVISION_STALE` 回流。

## 11. 前端实现顺序

1. Vue/Vite/TypeScript strict/Element Plus/Router/Pinia 工程壳和 generated client；
2. Shell、route-context、resource/error/task 公共组件；
3. P01/P02 + mock contract adapter；
4. P03 五区静态骨架和响应式；
5. X6 Symbol Catalog renderer 与 projection adapter；
6. editor-session、Command、revision/conflict/readonly；
7. OPL/Trace/Finding/Task/基线入口；
8. 组件测试、P0 E2E 和生产 build。

完整画布增量顺序：

1. `DEV-CANVAS-00` 完成 OpenAPI/Schema 和 generated client；
2. renderer 先支持全部 descriptor 的纯组件/golden，不连接生产工具；
3. State 工具、检查器和命令闭环；
4. Procedural -> Control -> Structural 分包接入；
5. OPL/Trace/Rule 阻断闭合后逐 Capability 启用；
6. 桌面/窄视口视觉、跨浏览器 E2E 和 Chromium 性能证据通过后完成发布门槛；窄视口不代表移动端产品支持。

## 12. 联调前检查清单

1. OpenAPI 生成 TypeScript 类型无手工重复 DTO；
2. 所有写请求自动带 `X-OPM-Session`、command_id 和适用守卫；
3. 16 个 operationId 都有 client method；
4. Projection DTO 到 X6 ViewModel 有纯映射测试；
5. viewport 不进入 command client；
6. read revision 不一致时不渲染 current；
7. ErrorDetail 映射 blocked/failed/conflict/readonly；
8. Task SSE 断线回查 API-TSK-001；
9. P01-P03 fixtures 可以独立启动；
10. 1440x900、1280x800、390x844 截图和无溢出检查可自动执行。
11. 完整画布开发前，OpenAPI 已生成包含 impact summary/token、`base_fact_capability_ref` 和 Modifier `min/max/atomic_group_id` 的结构化 `CommandCapabilityOption` 及 State/Fact command union，前端无手写重复 DTO；
12. 16/8/10 每项均能从 Capability ID 解析到 symbol/template/rule binding；缺资产项不进入生产菜单；
13. State、fan、控制注记、双向/互惠标签均有 Projection -> X6 -> screenshot/component golden；
14. candidate 的 base revision 变化后失效，不能直接重放旧 option id。

## 13. 事实与建议

### 13.1 事实

1. P01-P06 原型已通过桌面/移动浏览器验收；
2. 当前仓库已有 DEV-00 Vue/Vite/TypeScript 工程壳，但不等于 P01-P03 或完整画布业务实现；
3. P0 OpenAPI 覆盖 16 个 operationId；
4. 当前工作区 OpenAPI 已有 `CREATE_STATE/UPDATE_STATE/UPDATE_FACT`、`base_fact_capability_ref`、`AllowedModifier` 和结构化候选，Revision 0.1 Schema 已有 Fact `modifiers[]`；0.2 机器发布、generated client/handler、兼容 reader 和正反 contract test 仍由 DEV-CANVAS-00/03 闭合；
5. 原型不是生产组件实现。

### 13.2 建议/待实现

1. 首个前端任务启用 `frontend-vue` playbook，并按仓库可用 JDP Vue3 skill 选择最小组合；
2. 精确依赖版本由首个 lockfile 冻结；
3. P04-P06 在 P01-P03 E2E 闭环后按独立开发包进入。
4. 完整画布不应等待 P04-P06，但必须在 P0 最小闭环和 `DEV-CANVAS-00` 后按能力分批启用。
