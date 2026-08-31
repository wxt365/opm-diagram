# DEV-CANVAS-06 Stage A Release Discovery And Source Guard Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Stage A 新增 `fault-launcher.controlled.release.spec.ts` 后出现的两个可执行冲突：

1. release config 测试仍要求 Playwright 返回 `No tests found`，与新增 spec 必须被固定 `**/*.release.spec.ts`发现的契约冲突；
2. 统一 source-chain owner/test 仍把 `S -> A`固定为四路径，无法接纳修正后的 Stage A。

本修正不修改 Playwright config、公共 Schema、API、SQLite DDL、production 配置、Runner Source Set、Report 版本或 Gate 语义。

## 2. 已复现事实

在 Node `22.22.0`、A candidate `8be0b837f0fdb326f87bb9438115780af9743536`上：

```text
node_modules/.bin/playwright test \
  --config tests/e2e/release/dev-canvas-06/playwright.release.config.ts \
  --list

Listing tests:
  fault-launcher.controlled.release.spec.ts:... › 受控 Fault Launcher 只经 Runner 生命周期接口执行
Total: 1 test in 1 file
```

因此 `scripts/canvas06-e2e-release-config.test.mjs`中`status=1 + No tests found`的旧断言已经失效。`scripts/canvas06-unified-production-input.mjs`及其测试同时固定 `FAULT_2A_DELTA.length=4`、累计长度 `24`，会拒绝任何包含 discovery test 修正的 A。

## 3. 唯一修正

Stage A allowlist 由`4=2 M+2 A`修正为：

```text
M scripts/canvas06-e2e-release-config.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
```

按 UTF-8 path bytes 排序后，`S -> A`必须精确为`7=5 M+2 A`。其中两个 unified source owner 已在 `O -> C`出现，故累计口径固定为：

```text
O..A = 25=15 M+10 A
O..R = 43=31 M+12 A
```

Stage C=`20=12 M+8 A`、Stage S=`2 M`保持不变；Stage R由后继闭包扩为`23=21 M+2 A`，Runner Source Set仍为`0.2/0.2.0/24`。

## 4. Discovery 测试契约

`scripts/canvas06-e2e-release-config.test.mjs`必须继续验证固定 browser/context、`workers=1`、`retries=0`、无`webServer`、无 Vite/dev server，并把 discovery 断言唯一改为：

1. 只以当前受控`process.execPath`执行`node_modules/@playwright/test/cli.js`，禁止`.bin` shebang、PATH或系统Node fallback；
2. Playwright `--list`退出码为`0`；
3. 恰发现一个 `.release.spec.ts`测试条目；
4. 唯一文件为`fault-launcher.controlled.release.spec.ts`；
5. 唯一标题为`受控 Fault Launcher 只经 Runner 生命周期接口执行`；
6. 汇总精确为`Total: 1 test in 1 file`。

不得放宽为“至少一个”、任意 basename、任意 title、目录扫描结果或忽略退出码。

## 5. Source Guard 契约

`FAULT_2A_DELTA`必须包含第3章七项并按 UTF-8 path bytes 排序。`FAULT_2A_CUMULATIVE_DELTA`必须为`25`项，`FINAL_RUNNER_CUMULATIVE_DELTA`必须为`42`项；重叠的 unified owner/test 在累计集合中各只出现一次。

controlled Preflight Report `0.2`不增加字段；`implementation_delta`数组改为同序七项。D01继续从`parent(A)=S`、`parent(S)=C`、`parent(C)=O`复核，不允许默认旧四项、跳过 discovery test、只比较数量或在 verifier 内 fallback。

## 6. 验收

必须至少通过：

```text
node --test scripts/canvas06-unified-production-input.test.mjs
node --test scripts/canvas06-e2e-release-config.test.mjs
node --test scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
npm run release:canvas06:e2e:runner:test
npm run contract:validate
git diff --check
```

所有 Node 命令使用受控 Node 22。测试通过只接纳 Stage A source，不构成 D10B、真实 controlled Playwright、`194/388`、Report、Gate、Candidate、Activation、Capability、production 或 ISO 19450:2024 证据。

## 7. 回滚

回滚只撤销本修正规格和上述七路径中的 Stage A patch。不得恢复`No tests found`作为活动正例，不得修改 Playwright config 来隐藏新增 spec，也不得把 source guard 放宽为额外路径可接受。

## 8. 实现记录

```text
A source commit = db85405526c558275d8c20a8beb75601968e2e3a
parent S = 2f698cff34aeb9a0916c9a45b507083f1bf937fa
tree = bd3df6be759420dc317ea71f75b976af483612b3
committer epoch = 1788011181
source patch sha256 = bb4848f2ea4ef57b258879d4cb3a5d3568229e5a0b25de510b06111493b7cb70
source worktree clean = true
S..A delta = 7=5 M+2 A
FAULT_2A source guard = READY
```

Node 22回归：定向`9/9`、Runner`60/60`、Common Visual`14/14`、Visual/E2E Schema`20/20`、Contract通过。该记录只接纳A source，不表示D10B或controlled Playwright已执行。
