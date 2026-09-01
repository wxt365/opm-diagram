# Spec: DEV-CANVAS-06 Common Critical Region Projection 闭包修正

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`DESIGN_CORRECTION_REQUIRED / 03C_ADAPTER_PREFLIGHT_BLOCKED`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

冻结 Common Fixture Catalog 的 UI 区域语义到 Golden Capture Plan 的 capture 区域语义的唯一投影，解除 03C Adapter 在 Plan/Catalog join 上的确定性拒绝。

## 2. Root Cause

Catalog Schema 的 `critical_regions[].kind` 使用 UI 语义枚举（例如 `CANVAS`、`LABEL`、`JUNCTION`、`TOOLBAR`），而 Capture Plan Schema 使用捕获语义枚举（例如 `FOCUS_BBOX`、`LABEL_SLOT`、`JUNCTION_MARKER`）。Planner 已在本地实现了转换；Adapter 和 Adapter Test Input verifier 却将两种形状直接作 JCS 相等比较。因此每个活动 Common capture 都在创建 Base 前被错误拒绝。

## 3. 冻结契约

1. 唯一转换 owner 为新模块 `scripts/canvas06-common-critical-regions.mjs` 导出的 `projectCatalogCriticalRegions(catalogRegions)`。Planner、03C Adapter 与 Adapter Test Input verifier 必须静态 import 同一导出，禁止复制条件分支、目录扫描或兼容 fallback。
2. 输入数组保持顺序；输出为新对象数组，保持 `region_id`，且映射固定为：

| Catalog UI kind | 条件 | Capture Plan kind |
| --- | --- | --- |
| `CANVAS` | 无 | `FOCUS_BBOX` |
| `LABEL` | `region_id === "COMPLETENESS"` | `COMPLETENESS` |
| `LABEL` | 其余合法 `region_id` | `LABEL_SLOT` |
| `JUNCTION` | 无 | `JUNCTION_MARKER` |
| `TOOLBAR` | 无 | `CANVAS` |

3. `MARKER`、`NODE`、`INSPECTOR`、`BOTTOM_PANEL` 以及未知 kind 不是活动 Common Visual 到 Capture Plan 的可投影输入；mapper 必须以 `GOLDEN_COMMON_CRITICAL_REGION_INVALID/2` 拒绝。不得静默保留原 kind。
4. Planner 只以 `projectCatalogCriticalRegions(subject.critical_regions)` 写入 `capture.critical_regions`。Adapter 和 Bundle verifier 只接受 `capture.critical_regions` 与该投影 JCS 相等；Fixture `capture_setup` 不承载此字段，禁止读取或新增该字段。
5. 正反例至少覆盖 `CANVAS`、普通 `LABEL`、`COMPLETENESS`、`JUNCTION`、`TOOLBAR`、不支持 UI kind、错误数组输入和 Plan 侧投影漂移。

## 4. 修改边界

允许修改：本规格和对应 checklist、活动 Common/03C 设计与实现规格、共享 mapper 及其测试、Planner、03C Adapter、Adapter Test Input verifier 与其定向测试入口。

禁止修改：Catalog/Plan/Fixture Schema、Catalog 或 Fixture 业务字节、SQLite V1、公共 HTTP API、OpenAPI、Vue、production Candidate/Activation/Gate/Capability/ISO 状态与历史输入根。

## 5. 验收

1. 共享 mapper 的全部正反例通过，且 Planner、Adapter、verifier 静态复用它。
2. 现有 Adapter Test Input 的 staging/installed 正例与篡改反例持续通过。
3. 真实受控 callback 仅在 mapper preflight 后进入 8 Base/144 attempt；该执行结果只证明受控测试链路，不构成 Candidate、Activation、Capability enablement、GATE READY 或 ISO 证据。

## 6. 回滚

回滚仅回退本规格新增的 mapper、三处静态 import、测试和同步文档。不得用将 Catalog 改写成 Capture Plan 枚举或放宽相等比较替代该映射。

## 7. 事实与假设

事实：活动 Catalog 中实际使用 `CANVAS`、`LABEL`、`JUNCTION` 与 `TOOLBAR`；现有 Planner 已对它们转换，现有 Adapter 直接比较造成 preflight 失败。假设：无。
