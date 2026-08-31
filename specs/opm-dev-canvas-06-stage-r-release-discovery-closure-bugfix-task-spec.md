# DEV-CANVAS-06 Stage R Release Discovery Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Stage R 新增 `family.controlled.release.spec.ts` 后的 release discovery 与 source allowlist 冲突，使固定 Playwright config、release config 验收、Stage R exact delta 和最终 source guard 能同时成立。

本修正不修改 Playwright config、Context/Manifest/Attempt/Report Schema、公共 API、SQLite DDL、production 配置、Runner Source Set条目或Gate语义。

## 2. 已复现事实

Stage A 的 `scripts/canvas06-e2e-release-config.test.mjs`把活动正例固定为：

```text
fault-launcher.controlled.release.spec.ts
Total: 1 test in 1 file
```

Stage R 必须新增：

```text
tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

该文件符合既有 `**/*.release.spec.ts`，因此新增后 Playwright `--list`必然发现两个测试。现有 Stage R `25=23 M+2 A`又不允许修改 release config 验收文件，导致合法 bridge 与必跑 Runner 测试不能同时通过。

## 3. 唯一修正

Stage R allowlist 增加：

```text
M scripts/canvas06-e2e-release-config.test.mjs
```

活动计数更新为：

```text
Stage R = 26=24 M+2 A
O..R = 45=33 M+12 A
```

Stage C=`20=12 M+8 A`、Stage S=`2 M`、Stage A=`7=5 M+2 A`和`O..A=25=15 M+10 A`不变。Runner Source Set继续为`0.2/0.2.0/24`；discovery test不进入Source Set，因此相对A仍为`9 changed/new +15 unchanged`。

本规格只取代旧规格中的Stage R `25`与累计`45`计数，不改变其余语义和路径。

## 4. Discovery 验收

`scripts/canvas06-e2e-release-config.test.mjs`必须继续使用当前受控`process.execPath`直接执行`node_modules/@playwright/test/cli.js --list`，并固定验证：

1. 退出码为`0`；
2. 恰发现两个`.release.spec.ts`测试；
3. 按Playwright输出原序逐项为：

```text
family.controlled.release.spec.ts -> 受控 Family E2E 只经 Runner session 执行
fault-launcher.controlled.release.spec.ts -> 受控 Fault Launcher 只经 Runner 生命周期接口执行
```

4. 汇总精确为`Total: 2 tests in 2 files`；
5. config仍固定browser/context、`workers=1`、`retries=0`且不含`webServer`、Vite或dev server。

禁止放宽为“至少两个”、任意basename/title、默认test discovery、隐藏Family bridge或修改config使其条件排除。

## 5. Source Guard

`RUNNER_DELTA`必须按UTF-8 path bytes包含本规格新增的 discovery test，精确为`26`项；由于该路径已存在于Stage A累计集合，`FINAL_RUNNER_CUMULATIVE_DELTA`仍精确为`45`项。两个集合仍比较exact `status<TAB>path`，禁止只比较数量、允许额外路径或从文件系统扫描补齐。

## 6. 修改边界

本设计包只允许修改`specs/**`、`docs/design/**`、`docs/checklists/**`和`docs/README.md`。

后继实现只新增以下Stage R ownership：

```text
M scripts/canvas06-e2e-release-config.test.mjs
```

并继续在既有Stage R owner中同步 source guard：

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

## 7. 验收与回滚

至少执行：

```text
node --test scripts/canvas06-e2e-release-config.test.mjs
node --test scripts/canvas06-unified-production-input.test.mjs
npm run release:canvas06:e2e:runner:test
npm run contract:validate
git diff --check
```

全部Node命令使用受控Node 22。回滚必须同时恢复Family bridge、discovery test、Stage R allowlist和26/45 source guard口径；不得只隐藏bridge或放宽测试。

上述通过只接纳Stage R source，不构成真实`194/388`、Report、GATE-06-03、Candidate、Activation、Capability、production或ISO 19450:2024证据。
