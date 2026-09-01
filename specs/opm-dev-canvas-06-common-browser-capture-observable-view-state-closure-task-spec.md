# Spec: Common Browser Capture P03 可观测视图状态闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue`（primary）
- `testing`

## 1. 目标与边界

为 `GOLDEN-AUTHORING-03B` 的真实浏览器 callback 固定唯一、只读的 P03 视图状态读取口径。callback 只能读取 DOM 与 Runtime API，禁止读取 Pinia、从 fixture 的 `expected_projection` 回填状态、`page.evaluate` 写状态或通过页面层级/CSS 反推语义。

允许修改 `apps/web/src/modules/workbench/**`、`apps/web/src/stores/workbenchRuntime.ts`、定向 Vue/Pinia 测试、03B 规格与 checklist。禁止修改 Runtime API、SQLite DDL、fixture、Projection normalizer 输入/输出 Schema、公共 command payload、Bootstrap wire 和 Candidate/Manifest writer。

## 2. 冻结视图状态

`WorkbenchView` 必须渲染唯一根元素 `data-testid="p03-capture-view-state"`。该元素不承载业务输入，且以下属性的值由当前 UI 状态直接渲染：

```text
data-read-revision
data-selection-kind = none|single-element|relation
data-selection-target-id = "" 表示 null
data-right-open = true|false
data-right-mode = ""|inspector-element-fields|inspector-relation-fields
data-bottom-open = true|false
data-bottom-mode = ""|FINDINGS|HISTORY
data-relation-candidate-state = none|preview
data-relation-candidate-capability-id = "" 表示 null
data-relation-candidate-id = "" 表示 null
data-relation-candidate-source-target-id = "" 表示 null
data-relation-candidate-target-target-id = "" 表示 null
data-catalog-open = true|false
data-catalog-search
data-catalog-procedural-count
data-catalog-control-count
data-catalog-structural-count
data-finding-selected-id = "" 表示 null
data-finding-highlighted-target-id = "" 表示 null
data-feedback-current-code = "" 表示 null
```

`p03-capture-view-state` 的 DOM 子元素 `[data-opm-history-code]` 按 DOM 顺序给出 `feedback.history_codes`；history 未打开或没有记录时为空。callback 必须分别读取属性和这些子元素，并将空字符串映射为 JSON `null`。不得读取该元素以外的应用内存。

默认状态为：right panel closed、bottom panel closed、selection none、relation candidate none、catalog closed、finding null、feedback current null。右侧 inspector 在 closed 时只显示 `data-testid="p03-right-panel-open"` 的打开命令；`OPEN_RIGHT_PANEL` 只可在已有 selection 时打开。打开后，其 mode 由 selection 唯一确定：Node 为 `inspector-element-fields`，Fact 为 `inspector-relation-fields`。不允许通过选择动作隐式打开。

`OPEN_BOTTOM_PANEL` 使用既有 `p03-tab-findings` / `p03-tab-history`；bottom mode 不是 `text`/`method` 时才为 open。`setBottomTab(text|method)` 必须使 `bottom_open=false,bottom_mode=null`。

## 3. Subject 专属可观察状态

- `SELECT_OCCURRENCE` 对 Node 产生 `single-element`，对 Fact 产生 `relation`；target 必须为真实 target/Fact ID。
- `SELECT_RELATION_TOOL` 在非只读状态下可从无选择状态进入 `selecting-target`，不得要求或伪造预选 Node。若用户在点击工具前已经显式选择一个 Node，该 Node 保持为第一个 endpoint；否则 endpoint list 从空数组开始，随后两次 `SELECT_ENDPOINT` 分别形成 source 与 target。该规则不隐式改变 `selectedId`，因此 `CANDIDATE_LAYER` 的 selection 仍为 `none`。
- `CANDIDATE_LAYER` 的 `previewing` 必须在 X6 中产生唯一 transient edge：`id=candidate.visual.candidate-layer`，并在其 `line` 上只写 `data-opm-candidate-cell-id` 和 `data-testid=p03-candidate-candidate.visual.candidate-layer`。它不得写 `data-opm-capture-cell-id`、不得进入 `relations`、Runtime Projection 或 committed cells。取消或确认前重新 render 时必须移除它。
- `relation_candidate.state=preview` 时根属性 `data-relation-candidate-source-target-id/target-target-id` 必须分别是当前 preview 的 `sourceId/targetId`；非 preview 时均为空字符串。它们是 transient Projection endpoint 的唯一 DOM 读取来源，callback 不得从 fixture `expected_projection`、步骤、目录、布局或路径回填。
- `LOCATE_FINDING` 只能设置 `highlightedFindingTargetId`，不得修改 selectedId、committed geometry 或 revision。画布中匹配 Fact 的主语义 edge 增加 `data-opm-finding-highlight=true`；没有高亮时该属性为 `false`。Finding selection 仍由 `selectedFindingId` 唯一表示。
- Catalog closed 时三个 count 均为 `0`；open 时分别是当前 search 过滤后的 `relationCatalogItems(PROCEDURAL|CONTROL|STRUCTURAL).length`。`CLEAR_RELATION_SEARCH` 后可得到 `16/8/10`；展开状态通过既有三个 `p03-relation-catalog-toggle-*` 控制，且不改变 count。
- History 的每条 record 必须渲染一个 `data-opm-history-code`，其值为 `diagnostic_id` 最后一个 `.` 后的 ASCII token。仅当该 token 是 `VALIDATION_BLOCKED`、`REVISION_CONFLICT` 或 `READONLY` 时进入该属性；其他 record 不得伪造为上述 code。
- 反馈 code 由 `workbench.feedbackCode` 唯一提供；首次 `BLOCKED_FEEDBACK` 提交后必须为 `PERSISTENCE_FAILED`。该 code 已被 `p03-command-feedback-code` 显示，根属性只是同一 UI 状态的受控读取口径。

## 4. 验收与回滚

- `OVS-01`：八类 fixture 的终态均可仅从受控 DOM 属性/元素编码为第 8.1 节 Projection 状态。
- `OVS-02`：right panel 显式打开、catalog count、finding highlighter、history code 与 feedback code 有正反例组件测试。
- `OVS-03`：candidate transient cell 唯一存在且不带 committed capture anchor，有 `OpdCanvas` 测试。

执行 Web typecheck 与 `WorkbenchView.spec.ts`、`OpdCanvas.spec.ts` 定向测试。回滚仅撤销本规格允许文件，恢复此前无额外受控观测状态的 P03 表现。
