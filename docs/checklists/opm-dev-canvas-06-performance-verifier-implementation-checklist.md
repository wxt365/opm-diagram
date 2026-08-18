# DEV-CANVAS-06 Performance Verifier Checklist

- Task Type：`feature`
- Active Playbooks：`testing (primary)`
- 当前规格：[Performance Verifier 实现](../../specs/opm-dev-canvas-06-performance-verifier-implementation-task-spec.md)

## Spec Mapping

| 规格 | 实现 | 验证 | 非目标/回滚 |
| --- | --- | --- | --- |
| §1 | 只读 verifier 与 npm 入口 | ready/篡改/blocked 测试 | 不运行 benchmark；§4 回退 |
| §2 | 相对 ref、SHA、stats、阈值、状态守卫 | 定向 Node test | 不写 evidence/gate |
| §3 | exit 0/2/3 边界 | CLI 测试 | 不证明真实性能 |

## 清单

- [x] 实现 Schema/ref/SHA/样本完整性与 nearest-rank 校验。
- [x] 实现 READY/Blocked 退出码。
- [x] 新增正反例和 npm 入口。
- [x] `npm run release:canvas06:performance:verifier:test`：`4/4 PASS`。
- [x] `npm run contract:validate` 与 `git diff --check` 通过。

## 事实与遗留

- 事实：verifier 只读校验 evidence root，不生成或改写 fixture、Manifest、Samples、Report、Candidate、Activation 或 production gate。
- 事实：READY 必须重新校验 7 份 Raw Samples 的 ref/SHA、完整性、nearest-rank P50/P95/Max、阈值、功能守卫和聚合计数；合法 BLOCKED 在未要求 READY 时返回 `0`，带 `--require-ready` 返回 `3`。
- 遗留：尚未实现 fixture factory、Manifest builder、runner、reporter；没有真实性能测量或 GATE-06-04 READY 证据。
