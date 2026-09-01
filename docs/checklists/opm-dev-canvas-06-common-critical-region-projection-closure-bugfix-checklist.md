# Checklist: DEV-CANVAS-06 Common Critical Region Projection 闭包修正

状态：`IMPLEMENTED/CONTROLLED_03C_PASS`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-critical-region-projection-closure-bugfix-task-spec.md`。
- Task Type：`bugfix`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 目标与根因：规格第 1 至 2 节。
- 投影、错误边界与正反例：规格第 3 节。
- 修改/禁止边界：规格第 4 节。
- 验收、回滚与证据边界：规格第 5 至 7 节。

## Checklist

- [x] M01 复现：03C Adapter 因 Plan capture 与 Catalog UI region 直接比较而在 Base 前拒绝。
- [x] M02 冻结唯一 Catalog-to-Capture 投影、不可投影 kind 与稳定错误码。
- [x] M03 提取共享 mapper，Planner、Adapter、Bundle verifier 已静态复用。
- [x] M04 覆盖五种合法映射与四类非法输入；Adapter/Bundle verifier 均拒绝 Plan 投影漂移。
- [x] M05 Adapter Test Input 定向正反例和真实 8 Base/144 attempt 受控路径通过。

## 风险与遗留项

- 本修正不改变 Catalog 或 Capture Plan Schema，也不改变既有历史 Plan 的事实字节。
- 通过 mapper 与03C受控调度不等于真实 UI setup、PNG determinism、Candidate、Gate、Capability 或 ISO 证据。
