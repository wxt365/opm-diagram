# Spec: DEV-CANVAS-06 R14 Playwright Global Timeout Boundary Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

修复 production `194` case、`388` 次严格串行 INITIAL/REOPEN 调度被 Playwright 全局 `120_000 ms` 超时中断的问题。该值是单一 Playwright test 的总时限，不是每个受控 attempt 的时限。

## 2. 已复现事实

1. 使用 R13 production Manifest 启动完整 Runner 后，Playwright 在约两分钟时中断串行调度。
2. `tests/e2e/release/dev-canvas-06/playwright.release.config.ts` 固定 `timeout: 120_000`，使单一 controlled release spec 无法覆盖完整 `388` 次调度。
3. Runner 已对 Runtime、Web、health、snapshot、fault child、关闭与清理分别施加受控 timeout；`workers=1`、`retries=0` 已固定。

## 3. 冻结语义

1. Playwright release config 的全局 `timeout` 固定为 `0`，仅表示不对完整 Runner session 再施加第二个总时限。
2. 不得删除或放宽 Runner 中每周期 Runtime/Web/health/snapshot/fault/child-cleanup timeout；任何这类 timeout 仍是失败证据，不能以全局 `0` 规避。
3. `fullyParallel=false`、`workers=1`、`retries=0`、禁止 `webServer` 的现有规则不变。

## 4. Source-chain 与精确修改边界

新增唯一 target：`DIRECT_MAIN_R13`。

```text
44d8bdaa6c6de66de7447604deaaf1578c1cc146 (fixed R11 integration merge)
  -> 8608f05b1a397270d2f14152159019e1bf96e3b1 (R12)
  -> ce1b84d074d8a08c250b0fe868af7db387625a2b (R13)
  -> R14 candidate
```

`DIRECT_MAIN_R13` 先复核既有 R11/R12/R13 历史关系，再要求 R14 candidate 是 R13 的唯一 child，且 source delta 精确为下列八路径。R13 和既有 Manifest 均为只读历史，R14 必须重建新的 unified input 与 Manifest，禁止复用 R13 Manifest 作为 R14 Runner 输入。

```text
A docs/checklists/opm-dev-canvas-06-r14-playwright-global-timeout-boundary-bugfix-checklist.md
M scripts/canvas06-e2e-release-config.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/rebuild-canvas06-manifest-v02-production.mjs
M scripts/rebuild-canvas06-manifest-v02-production.test.mjs
A specs/opm-dev-canvas-06-r14-playwright-global-timeout-boundary-bugfix-task-spec.md
M tests/e2e/release/dev-canvas-06/playwright.release.config.ts
```

禁止修改 Schema、公共 HTTP API、SQLite DDL、Profile/fixture bytes、Runner 的局部 timeout、Driver、生产配置、`.gitignore`、Capability 状态及历史 source-chain 常量。

## 5. 验收

1. release-config 回归测试在旧 `120_000` 配置下失败，在 `timeout: 0` 下通过，同时断言单 worker、零 retry、无 `webServer`。
2. Node 22 source-chain 和 outer Manifest 参数测试接受 `DIRECT_MAIN_R13`，拒绝错误 target、错误 parent、错误 source/runner join 或超出八路径的 delta。
3. R14 仅有 `ce1b84d074d8a08c250b0fe868af7db387625a2b` 一个 parent，且 name-status 精确等于本节八路径；`git diff --check` 通过。
4. R14 commit 后重建外置 unified input 和 Manifest，并由 installed verifier 独立验证；只有新 Manifest 可作为完整 Runner 输入。

## 6. 回滚

回退 R14 单一 child commit 即可恢复 R13 的总超时行为。R13 source、已安装 release store、历史 Manifest 与失败运行 evidence 均不得覆盖或作为新输入复用。
