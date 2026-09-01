# Spec: DEV-CANVAS-06 Common Visual Root 44-File Inventory 闭包修正

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`DESIGN_CORRECTION_REQUIRED / ADAPTER_TEST_INPUT_BLOCKED`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

消除活动 Common Visual root 的文件数冲突，使 02B、03C 与 Adapter Test Input Bundle 只接受同一个可验证布局。活动 root 固定为：

```text
44 = 1 Catalog + 8 Visual fixture + 32 E2E BASE/INPUT fixture
   + 2 source mirror + 1 dev-canvas-06-common-setup-plan.json
```

因此 Adapter Test Input Bundle final root 固定为 `341=2 bundle/request + 1 staged Runtime JAR + 5 Profile asset + 44 Common + 288 Observed/PNG` 个普通、非链接、单链接文件。

## 2. Root Cause

`build-canvas06-common-visual-fixtures.mjs` 已在写入 Catalog、fixture 与 source mirror 后写入 `dev-canvas-06-common-setup-plan.json`；其只读 verifier 也已把它纳入 44-file inventory。活动 Adapter Bundle Schema 与若干上游设计仍固定 `43/340`，导致正确 Builder 输出在 Bundle Schema 预检阶段被拒绝。

Common Setup Plan 是 Common E2E setup 的受控输入，保留它；禁止通过删除该文件、忽略它或在 tree digest 外排除它来恢复旧计数。

## 3. 冻结契约

1. `dev-canvas-06-common-setup-plan.json` 位于 Common root，必须为普通、非链接、单链接 UTF-8 JSON 文件，并由现有 `verifyCommonSetupPlan()` 按 Catalog、binding、generator 与 Common Driver raw ref 校验。
2. `COMMON_FIXTURE_TREE` 的 `file_count` 固定为 `44`；tree preimage 是 Common root 内按 UTF-8 path 升序排列的全部 44 个 `{path,byte_length,sha256}`，包括 setup plan。
3. Bundle Schema 的 `common_fixture_tree_ref.file_count=44`，`byte_length` 最小值为 `44`；Bundle 其他字段、schema id/version、path、raw-ref、JCS 公式及 144 个 callback descriptor 不变。
4. Adapter Test Input final root 的 allowlist 和 installed/staging verifier 都固定为 `341` 个普通文件；不得以目录、link、临时文件或 Git metadata 补足计数。
5. 历史 `43=1+8+32+2` 根和其已记录 raw/tree SHA 继续作为历史执行记录，不得伪造为 44-file root，也不得再作为活动 Adapter/Planner/Manifest/03C 输入。

## 4. 修改边界

允许修改：本规格、对应 checklist、活动 Common/03C 设计与实现规格/checklist、Adapter Test Input Bundle Schema、Builder/Verifier/Test、契约与文档索引中对活动 `43/340` 的描述。

禁止修改：Common fixture、Catalog、Common Setup Plan、Profile、Plan、Observed Result 的业务语义与 Schema；SQLite V1、公共 HTTP API、OpenAPI、Vue、production candidate/approval/Gate/Capability/ISO 状态；历史 43-file 执行记录的事实值。

## 5. 验收

1. Builder 正例可以生成并由 staging 与 installed verifier 接受的 341-file Bundle；其 `COMMON_FIXTURE_TREE.file_count=44`。
2. 缺失或篡改 Common Setup Plan、tree digest、file_count、Bundle raw ref 或额外 Common 文件均稳定拒绝。
3. `npm run release:canvas06:common-visual:materialize:test` 的 Adapter Test Input 正例和篡改反例通过；该命令只运行定向测试，真实物化保持唯一静态ESM入口。03C 后续 8 base/144 clone 仍需独立验收。
4. 任何该修正的测试结果均不构成 production input、Candidate、Activation、Capability enablement 或 ISO 证据。

## 6. 回滚

回滚仅回退本修正的 Schema、Builder/Verifier/Test 和活动文档口径；不得删除 setup plan 或覆盖历史 root。若回滚后重新出现 `43/44` 契约不一致，03C 必须保持阻断。

## 7. 事实与假设

事实：当前 Common Fixture Builder 与其只读 verifier 均已实现 44-file layout；Adapter Test Input Builder 正例被旧 Schema 的 `file_count=43` 拒绝。假设：无。
