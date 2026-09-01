# Spec: GOLDEN-AUTHORING-03B Common Browser Capture 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`
- `design-module-docs`

## 1. 目标

实现 Common Visual 的真实浏览器 capture callback，使 `runCommonVisualMaterialization(request, captureCallback)` 能经由正常 Web UI 与 Runtime API 完成 8 个 subject、72 个 capture、144 个 attempt 的受控路径。实现必须以 `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` 第 7、8 节为唯一 UI 状态和 normalized Projection 口径。

本包只实现受控测试和 Candidate Author 的静态接入，不生成 Candidate、Approval、Visual Manifest、Release Candidate、Activation 或 ISO 19450:2024 结论。

## 2. 设计输入

- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` 第 7、8 节；
- `docs/design/opm-frontend-handoff.md` P03、稳定 `data-testid` 和前端边界；
- `docs/design/opm-modeling-tool-application-api-contract.md` 的 API 查询约束；
- `specs/opm-dev-canvas-06-golden-candidate-author-implementation-task-spec.md`；
- `specs/opm-dev-canvas-06-common-visual-adapter-and-one-shot-fault-contract-closure-bugfix-task-spec.md`；
- Common capture invocation/observed-result/normalized-result Schema `0.1`。
- `specs/opm-dev-canvas-06-common-browser-capture-invocation-v02-closure-task-spec.md`。
- `specs/opm-dev-canvas-06-common-projection-normalizer-api-closure-task-spec.md`。
- `specs/opm-dev-canvas-06-runtime-relation-catalog-query-closure-task-spec.md`。
- `specs/opm-dev-canvas-06-common-occurrence-action-anchor-closure-task-spec.md`。
- `specs/opm-dev-canvas-06-common-blocked-feedback-command-discovery-closure-task-spec.md`。
- `specs/opm-dev-canvas-06-common-browser-capture-observable-view-state-closure-task-spec.md`。
- `specs/opm-dev-canvas-06-common-browser-capture-geometry-closure-task-spec.md`。

## 3. 修改边界

允许修改：

- `apps/web/src/modules/workbench/**`、`apps/web/src/stores/workbenchRuntime.ts` 和其定向 Vue/Pinia 测试；
- `apps/web/src/shared/api/localRuntimeApi.ts` 及与新增只读查询对应的 generated contract；
- `services/local-runtime/src/main/java/org/opm/localruntime/api/**`、其 application service/repository query 实现与定向测试；
- `docs/contracts/openapi/opm-local-api-v1.yaml`；
- Common browser callback、normalizer、Author 静态接入的 `scripts/**` 与定向测试；
- 本规格、对应 checklist 与实现状态文档。

禁止修改：

- SQLite DDL、Profile/Rule/Grammar/Symbol bytes、既有 capture/result Schema、公共命令 payload；
- Candidate/Approval/Publisher/Visual Manifest writer；
- 浏览器 mock、route interception、`page.evaluate` 写应用状态、DOM 注入或 checkout fallback；
- 无关 P03 重构和 `.harness/**`。

## 4. 受控接口

### 4.1 Runtime 只读查询

新增三个只读、revision-bound API，所有 response 均使用既有 `QueryEnvelope`：

| API ID | 路径 | 唯一数据源 | 返回字段 |
| --- | --- | --- | --- |
| `API-VAL-003` | `GET .../findings?revision=` | `finding_index`，按 `finding_id` UTF-8 升序 | `finding_id,rule_id,severity,category,context_id,entity_id` |
| `API-VAL-004` | `GET .../findings/{findingId}?revision=` | 同上 | 单个 Finding；不存在为既有 query 404 |
| `API-VER-006` | `GET .../operation-records?revision=` | `operation_record`，按 `occurred_at,operation_record_id` 升序 | 11 个 SQLite 映射字段，`result_revision_id` 保持 JSON `null` |
| `API-CAT-001` | `GET .../relation-catalog?revision=` | 三个受控 Runtime Catalog descriptor | 34 项 `family/capability_id/display_name/symbol_id/enabled/reason_codes` |

路径必须带 project/model/context，读取 revision 必须等于 request `revision` 且 Context 只返回该 Context 的 Finding。History 不得混用 Revision 列表替代 Operation Record。三者不写库、不生成 Revision、不得触发 validation。

`API-CAT-001` 的完整输入、排序、Control 禁用语义与 P03 anchor 以 `opm-dev-canvas-06-runtime-relation-catalog-query-closure-task-spec.md` 为准；它不替代端点已选后的 `API-EDT-001`。

### 4.2 P03 浏览器控制面

所有动作必须由稳定 `data-testid` 驱动，值由 fixture ID/枚举传入，禁止按可见文本或 CSS 层级选择。

1. relation candidate 增加 `previewing` 阶段。`SELECT_EXACT_OPTION(CAP-ISO-PROC-001)` 只生成内存 candidate：`candidate.visual.candidate-layer`、`state=preview`，不调用 `CREATE_FACT`，并保留 committed revision/projection；`confirmRelationCandidate()` 才沿用既有 `submitRelationCandidate()`，`cancelRelationCandidate()` 清除 preview。
2. relation catalog 使用一个打开态，固定展示 capability option 的三组计数 `PROCEDURAL=16`、`CONTROL=8`、`STRUCTURAL=10`。仅 `TOOLCHAIN_CATALOG` 的捕获要求三组均展开和 search 为空；disabled option 保留其 reason 的可访问文本。
3. Findings panel 从 `API-VAL-003` 读取列表，`SELECT_FINDING` 通过 finding ID 选择，`LOCATE_FINDING` 选择并聚焦 `entity_id` 对应 construct；不得改变 committed geometry。
4. History panel 从 `API-VER-006` 读取 Operation Record，保留 `VALIDATION_BLOCKED/REVISION_CONFLICT/READONLY`。`BLOCKED_FEEDBACK` 的 command 只能在 release-only Web Runtime 的精确 command id 下显示；第一次失败显示 `PERSISTENCE_FAILED`、Revision/head 不变，第二次调用沿用正常提交路径。普通 Web Runtime 不显示该入口。
5. normalizer 是 `scripts/canvas06-common-browser-capture.mjs` 唯一 owner：输入为 API Projection response 和已读取的 P03 view state，输出为设计第 8.1 节的封闭 Projection。它按 `cell_id` UTF-8 排序 committed cells，只从 `data-opm-capture-cell-id` 收集语义几何；候选只可出现在 `transient_cells`，不进入 Runtime/API Projection。全部 null/空数组显式写出，使用 `canonicalizeJcs` 深度比较和 SHA-256。生产 `cell_geometry_sha256` preimage、CSS 毫像素转换、稳定窗口、focus 与 PNG 写入只以 Geometry 闭包为准，测试专用 `TEST-GEOMETRY` preimage 不是生产输入。

### 4.3 Callback

新增唯一导出：

```js
export function createCommonBrowserCaptureCallback(options)
```

`options` 仅接受 `browser_executable`、`environment_policy` 与受控 `web_dist_root`。callback 每次接受一份 Capture Invocation `0.2`，严格执行：启动 production Web -> 新 Chromium context/page -> 使用 invocation 的显式 project/model/revision/context 打开工作台 -> 执行 fixture `steps[]` -> 等待同源 API/两个 RAF/quiet window -> 读取 normalizer、geometry、fault observation -> PNG -> 关闭 page/context/browser/Web。不得复用 browser、context、page、Web 或 view state，也不得从路径或数据库派生身份。

callback 只返回 Schema `OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-OBSERVED-RESULT-001/0.1` 的内存对象；PNG 写入 attempt root 的 `capture.png`，并在返回前计算 raw SHA、字节数与 geometry SHA。`BLOCKED_FEEDBACK` 必须在首次 command 后观测 `PERSISTENCE_FAILED` 和 fault count `1`；其他 subject 一律观测 `NONE/0/null`。

## 5. 验收

- `CBC-01`：三项只读 API 都有 OpenAPI、controller/service/repository 测试，History 真实读取 Operation Record。
- `CBC-02`：P03 能严格完成 8 类 UI step，候选 preview 不提交，目录计数为 16/8/10，Finding/History/one-shot feedback 状态可观察。
- `CBC-03`：Normalizer 对八类 fixture 的 expected Projection 深度相等，cell 只计 capture anchor，JCS digest 一致。
- `CBC-04`：callback 通过真实 browser/runtime/web 完成一个 subject 的 attempt 1/2 正反例；无 mock、无注入、无跨 attempt 状态。
- `CBC-05`：Author 静态导入 callback 并先执行 Family 后 Common；受控输入不足时仍稳定拒绝，不生成 READY artifact。

## 6. 验证与回滚

至少执行 web unit/typecheck、Runtime 定向测试、Common browser callback 定向测试、Author 定向测试、`npm run contract:validate` 与 `git diff --check`。若浏览器/Java 受控输入不可用，只记录为受控集成未执行，不将静态通过写成 03B 闭环。

回滚仅撤销本包允许路径的代码、测试、OpenAPI 和文档；不得删除 materialization base、candidate/approved 资产或用户数据。

## 7. Spec Mapping

| 规格项 | 目标 | 约束 | 验证 | 回滚 |
| --- | --- | --- | --- | --- |
| 4.1 | Finding/History 数据闭合 | 只读、revision-bound、无 DDL | CBC-01 | 撤销 query 层 |
| 4.2 | 八类 P03 UI step | 不改公共命令/不伪造状态 | CBC-02/03 | 撤销受控 UI |
| 4.3 | 真实 callback | production Web、双 attempt 隔离 | CBC-04/05 | 撤销 scripts 接入 |
