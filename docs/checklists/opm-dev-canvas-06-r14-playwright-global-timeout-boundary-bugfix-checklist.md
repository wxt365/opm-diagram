# Checklist: DEV-CANVAS-06 R14 Playwright Global Timeout Boundary Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## Spec Mapping

| 规格项 | 本轮承接 | 验证 |
| --- | --- | --- |
| 388 次串行总时限 | Playwright `timeout: 0` | 配置正反例 |
| 每周期失败边界 | Runner 局部 timeout 不变 | 静态回归 |
| 串行与零重试 | 保留 `workers=1/retries=0` | 配置回归 |
| R13 历史不变 | `DIRECT_MAIN_R13` 先验 R11/R12/R13 | source-chain guard |
| R14 输入身份 | 新 commit 后重建并 installed reverify | unified input/Manifest 重建 |

## Build Checklist

- [x] 冻结只取消 Playwright 全局总时限，保留 Runner 局部 timeout。
- [x] 冻结 `DIRECT_MAIN_R13` 的 parent 和八路径 allowlist。
- [x] 先将 release-config 测试改为要求 `timeout: 0` 并记录旧配置失败。
- [x] 将 release config 改为 `timeout: 0`。
- [x] 同步 unified input 与 outer Manifest 的 source-chain 解析和守卫。

## Verify Checklist

- [x] release config 正反例和 Playwright discovery 通过。
- [x] source-chain 与 Manifest 参数定向测试通过。
- [ ] R14 parent 与八路径 delta 精确匹配。
- [ ] 用 R14 source 重建 external unified input 与 Manifest，installed verifier 通过。
- [ ] 启动完整 `194/388` Runner；不生成 E2E Report、Candidate、Activation 或 Capability 状态变更，直到 Runner 完整成功。

## 回滚

回退 R14 单一 child commit；R13 及其外置 release artifacts 保持只读。
