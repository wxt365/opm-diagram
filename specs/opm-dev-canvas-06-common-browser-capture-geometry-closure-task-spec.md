# Spec: Common Browser Capture Geometry 与稳定窗口闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue`（primary）
- `testing`
- `design-module-docs`

## 1. 目标与边界

为 `GOLDEN-AUTHORING-03B` 的生产 Common Browser callback 冻结唯一 `cell_geometry_sha256` preimage、DOM 几何读取、稳定等待、focus 与 PNG 写入规则。该闭包只定义 callback 的受控读取与输出，不改变 Common Fixture、Capture Invocation/Observed Result Schema、Runtime API、P03 业务状态或 Candidate/Manifest writer。

允许修改 `scripts/canvas06-common-browser-capture.mjs`、其定向 Node 测试、03B 实现规格与 checklist。禁止修改 SQLite DDL、Profile/Fixture bytes、公共 command payload、既有 Schema、浏览器 mock、route interception、`page.evaluate` 写应用状态、DOM 注入和 checkout fallback。

## 2. Geometry Preimage

`cell_geometry_sha256` 固定为 `sha256(UTF8(JCS(preimage)))`。JCS 唯一使用 `scripts/canvas06-rfc8785.mjs` 的 `canonicalizeJcs/sha256Jcs`，不得使用 `JSON.stringify`、locale sort 或第二个 canonicalizer。

```json
{
  "schema_id": "OPM-DEV-CANVAS-06-COMMON-VISUAL-CELL-GEOMETRY-001",
  "schema_version": "0.1",
  "capture_id": "<invocation.capture_id>",
  "committed_cells": [
    {
      "cell_id": "<data-opm-capture-cell-id>",
      "layer": "COMMITTED",
      "geometry_css_millipx": {"x": 0, "y": 0, "width": 0, "height": 0}
    }
  ],
  "transient_cells": [
    {
      "cell_id": "<data-opm-candidate-cell-id>",
      "layer": "CANDIDATE",
      "geometry_css_millipx": {"x": 0, "y": 0, "width": 0, "height": 0}
    }
  ]
}
```

`geometry_css_millipx` 每项均为安全整数，算法为 `Math.round(css_pixels * 1000)`。其中 `x/y` 是 anchor `getBoundingClientRect()` 相对 `p03-canvas` 根 `getBoundingClientRect()` 的 CSS 像素；`width/height` 取 anchor 自身的 CSS 像素。读取到非有限值、转换后非安全整数、负 `width/height` 或不在 `p03-canvas` 后代的 anchor，必须以 `GOLDEN_COMMON_UI_SETUP_FAILED/3` 拒绝。

`committed_cells` 只从 `[data-opm-capture-cell-id]` 读取。每个 ID 必须非空、唯一，并按 UTF-8 byte lexical 升序；不得读取 X6 `data-cell-id`、装饰 Cell、label、marker 或任何未带该属性的节点。`transient_cells` 只从 `[data-opm-candidate-cell-id]` 读取，要求非空、唯一且同样 UTF-8 排序；除 `CANDIDATE_LAYER` 外必须为空，`CANDIDATE_LAYER` 必须恰为 `candidate.visual.candidate-layer` 一项。callback 同时要求两数组总数严格等于 `invocation.expected_cells`。该几何摘要独立于 `normalized_projection` 的 model layout，二者不得相互回填。

Candidate transient 的完整 Projection payload 仍由 `p03-capture-view-state` 的 `data-relation-candidate-state/capability-id/id/source-target-id/target-target-id` 读取；只有这五项满足 preview 组合时才形成 `{cell_id,layer:"CANDIDATE",target_kind:"FACT",capability_id,source_target_id,target_target_id,state:"preview"}`。不得从 `capture_setup.steps`、fixture `expected_projection` 或页面布局补齐 endpoint。

## 3. 稳定、Focus 与 PNG

每次 callback 均按以下固定顺序执行：

```text
正常 UI setup
-> 等待同源 Runtime Projection API 成功
-> requestAnimationFrame 两次
-> 读取 Projection、P03 view state 与 Geometry A
-> 等待 200ms quiet window
-> requestAnimationFrame 两次
-> 再读 Projection、P03 view state 与 Geometry B
-> JCS 深度比较 Projection/view state，Geometry SHA A=B
-> focus anchor
-> page.screenshot(attempt_root/capture.png)
```

quiet window 必须先以 Playwright `page.waitForLoadState("networkidle")` 确认浏览器已观察到网络空闲，再等待固定 `200ms`；callback 只可通过 DOM 读取 `document.fonts.status` 与等待 `document.fonts.ready`。两个读取点均必须是 `fonts.status="loaded"`。不得注入、猴子补丁或自行维护 pending `fetch/XMLHttpRequest` 计数；不得通过修改页面状态、禁用动画、截获请求或重试提交来制造稳定态。任一稳定检查不满足均为 `GOLDEN_COMMON_UI_SETUP_FAILED/3`，不返回 Observed Result。

focus anchor 必须由 `invocation.focus_target_id` 唯一映射：优先读取 `data-opm-capture-cell-id=<focus_target_id>`，其次从已读取的同源 Runtime Projection 中以唯一 `target_id=<focus_target_id>` 找到其 `cell_id`，再读取该 committed anchor；其后读取 `data-opm-candidate-cell-id=<focus_target_id>`，最后只接受 `P03-tool-relation-menu -> data-testid="p03-tool-relation-menu"` 或 `P03-command-feedback -> data-testid="p03-command-feedback"`。target 到 occurrence 的映射只能来自本次 API Projection，不能从 fixture `expected_projection`、步骤、目录或路径推导。后者是反馈 status 根的唯一只读 testid，不承载输入。每种映射均要求恰一个可见元素；找不到、重复或不可见均拒绝。callback 必须在 Geometry B 后对该元素调用 `scrollIntoViewIfNeeded()`，再次执行两个 RAF 与 200ms quiet window，并确认 Projection/view state/geometry SHA 未变化，才可截图。Focus 本身不得改变 selection、revision、candidate 或 panel。

PNG 唯一输出位置为 `<invocation.attempt_root>/capture.png`，父目录必须由 adapter 创建的 fresh attempt root，callback 使用 Playwright `page.screenshot` 以 `environment_policy.screenshot_options` 的冻结参数写入。写入后读取 raw bytes，返回其 SHA-256 与 byte length；不得写入 fixture、base、storage、checkout、Candidate 或任意第二张 PNG。

## 4. 验收与回滚

- `GEO-01`：production preimage 对 committed/candidate/排序/安全整数有正反例 Node 测试，且不接受 `TEST-GEOMETRY` schema。
- `GEO-02`：callback 测试只验证读取协定、稳定顺序、focus 和 `attempt_root/capture.png`；不使用 mock browser 作为 CBC-04 证据。
- `GEO-03`：非 candidate subject 的 transient 数量、candidate ID、anchor 重复或稳定漂移均稳定拒绝。

回滚只撤销本规格允许的 callback、定向测试、主规格与 checklist 改动；不得覆盖已有 attempt、base 或 golden 资产。
