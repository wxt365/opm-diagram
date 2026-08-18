# Spec: DEV-CANVAS-06 Performance Verifier 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`

## 1. 目标与范围

实现只读 `release:canvas06:performance:verify`：在 evidence root 内校验 Report、Manifest、七份 Raw Samples 的 Schema/ref/SHA、samples integrity、nearest-rank P50/P95/Max、阈值与 READY 状态。允许新增 verifier、定向测试、npm 入口和 checklist。

## 2. 非目标与边界

- 不生成 fixture、Manifest、Samples、Report 或性能结果；
- 不运行浏览器、Runtime、benchmark 或修改 production gate；
- 不信任 Report 自报统计，READY 必须从 Sample 重算；
- 不实现 JCS fingerprint 生成，Schema-valid BLOCKED Report 未带 `--require-ready` 时按冻结退出码返回 `0`。

## 3. 验收

1. 所有输入相对 evidence root，拒绝绝对路径和 root escape；
2. READY 校验 raw SHA、7 sample set、scenario/metric 对应、integrity、P50/P95/Max、threshold 与 summary；
3. `--require-ready` 对合法 BLOCKED 返回 `3`；
4. 定向正例、digest 篡改、统计篡改、BLOCKED 退出码测试通过；
5. `contract:validate` 与 `git diff --check` 通过。

## 4. 回滚

回退新增 verifier、测试、npm 入口及本规格/checklist；不影响任何 evidence 或 production state。
