# Spec: GOLDEN-AUTHORING-03B Family Capture Adapter 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

实现 [Family Capture Adapter 设计](../docs/design/opm-dev-canvas-06-golden-authoring-family-capture-adapter-design.md)，为 03B 建立 Family 的 packaged-JAR Clone、长驻 Runtime Ready、受控 Node/browser/prod-Web 调度和 `1170*2=2340` 次 attempt 的机器边界。它不实现 PNG candidate transaction、Authoring Report 主链、Approval、Publisher 或任何 Gate。

## 2. 前置与非目标

前置：03B preflight 的 Plan/130 Materialization消费闭环已实现；03C Common Adapter 仅作为结构参考；exact Java 21、Runtime JAR、Profile asset root、Web dist、Browser 和 03B preflight输入均必须由调用者已有闭包提供。

禁止修改公共 API、OpenAPI、SQLite DDL/Migration、除 `OpdCanvas.vue` capture anchor 外的 Vue 产品行为、Profile业务 bytes、Common Adapter/Schema、Approval/Publisher/Manifest、E2E Runner/production Web server、依赖和 `.harness/**`。不得把受控测试或代码存在表述为真实 candidate、approved、GATE、Capability 或 ISO 证据。

## 3. 精确修改范围

允许修改或新增且仅限下列文件：

```text
docs/design/opm-dev-canvas-06-golden-authoring-family-capture-adapter-design.md
docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-identity.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-family-clone-result.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-family-runtime-ready.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-invocation.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-observed-result.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-adapter-result.schema.json
specs/opm-dev-canvas-06-golden-authoring-family-capture-adapter-implementation-task-spec.md
docs/checklists/opm-dev-canvas-06-golden-authoring-family-capture-adapter-implementation-checklist.md
docs/design/opm-dev-canvas-06-golden-authoring-design.md
docs/checklists/opm-dev-canvas-06-golden-candidate-author-implementation-checklist.md
docs/README.md
package.json
scripts/canvas06-golden-family-capture-adapter.mjs
scripts/canvas06-golden-family-capture-adapter.test.mjs
scripts/release-canvas06-golden-author.mjs
scripts/release-canvas06-golden-author.test.mjs
scripts/validate-canvas06-golden-family-capture-adapter-schemas.test.mjs
apps/web/src/modules/workbench/OpdCanvas.vue
apps/web/src/modules/workbench/OpdCanvas.spec.ts
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ReleaseGoldenAuthoringLaunchMode.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/GoldenFixtureMaterializationException.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/familycapture/GoldenFamilyCloneRunner.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/familycapture/GoldenFamilyRuntimeReadyWriter.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/familycapture/GoldenFamilyRuntimeReadyConfiguration.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/ReleaseGoldenAuthoringLaunchModeTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/familycapture/GoldenFamilyCloneRunnerTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/familycapture/GoldenFamilyRuntimeReadyWriterTest.java
```

`LocalRuntimeApplication` 已按 `finite()` 处理 mode，不授权本包修改；若新 mode 无法复用该机制，必须新开规格，不能扩大 allowlist。

## 4. 实现约束

1. 新增的三份 Schema 必须按设计第 2、3 节冻结字段、状态、`additionalProperties:false` 与 JCS payload SHA；Schema test 必须同时验证正例、未知字段、payload/identity/ref 漂移。
2. `ReleaseGoldenAuthoringLaunchMode` 只增加两个 Family mode，并把 Common/Family switch 作为同一互斥集合验证；默认和现有四个 mode 行为不变。`GoldenFixtureMaterializationException.exitCodeFor()` 仅增加三个 Family 错误码的 `2/3/4` 映射，是 mode/Clone/Ready 唯一退出码 owner。
3. Clone 只能复用 `GoldenFixtureAttemptCloneVerifier` 创建 storage；不得复制其实现、Node复制SQLite或从目录推断身份。`base-storage-root` 是唯一 Report 解析锚点，必须满足设计第 3 节的固定三层祖先、fixture key、`materialization/reports/<key>.json` raw ref 与物理 `reports/<key>.json` 的深度 join；不得扫描、搜索或采用当前目录/attempt root fallback。Clone Result 与 Runtime Ready 均按 fresh/temp/fsync/rename/fsync 写入。
4. Node Adapter 只消费 `preflightAuthorInvocation()` 返回的冻结对象与显式 callback；Author CLI 的唯一新增受控参数为 `--web-dist`，preflight 将其无 symlink tree digest 与 Plan 精确 join，并返回 Family 五项 sealed realpath 输入及唯一 fresh `<candidate-root>.family-work`。Bundle 原件只能由 exact Java 21 sibling `bin/jar` 先列举、后解包至 Adapter work root 内的全局 fresh `verified-bundle` staging；其 entry allowlist、regular entry 和逐 byte raw ref 均验证成功后，才允许创建任一 attempt root。每个 attempt 仅从该已验证 staging 复制其 fixture 到 `inputs/fixture.json`；不增加 Adapter 公开 CLI 参数或 fallback。
5. Family callback 只能消费 Schema-valid Invocation 0.1，并返回 Schema-valid Observed Result 0.1。Adapter 必须以 Invocation/Observed Result、clone/ready raw refs 和关闭证明构造 Schema-valid Adapter Result 0.1；三个 payload SHA 均为删除本字段后的 RFC8785 JCS UTF-8 SHA-256。Observed Result 的 `projection_sha256` 必须等于 Plan expected projection，`png_byte_length/png_sha256/width/height/cell_geometry_sha256` 是 Candidate Report capture attempt 的唯一来源。callback 不得返回路径、存储句柄或启动/关闭控制权。几何定位只能使用 `data-opm-capture-cell-id`，不得使用 X6 对装饰 Cell 自动注入的 `data-cell-id`；`OpdCanvas` 必须对每个语义节点/Facts 只写一个 capture anchor，并以组件测试覆盖 Effect/fan/State 装饰不重复计数。
6. Node 通过现有 production Web server 提供 attempt-local exact Web dist；用显式 Ready artifact、health和bootstrap进入 callback；固定 `30s/10s`、SIGTERM/SIGKILL、port/sidecar/base digest 规则。
7. 03B 主链只在 Family 和 Common adapter 均成功后继续 candidate transaction；本包初期可保留主链的原 `GOLDEN_AUTHOR_INTERNAL_ERROR`，但不得绕过 Family Adapter 或伪造 attempt result。

## 5. 验收与验证

| ID | 验收 | 最低验证 |
| --- | --- | --- |
| FCA-01 | 两个 Family mode、互斥守卫和有限/长驻生命周期正确 | Java 单测 |
| FCA-02 | Identity/Clone/Ready 三 Schema 和 JCS/ref/identity反例闭合 | Node Schema test |
| FCA-03 | Clone 从已验证 immutable Family base 创建 fresh storage，拒绝 sidecar、symlink、非空、Report 解析锚点或 raw/identity 漂移 | Java 单测 |
| FCA-04 | Runtime Ready 只在双 loopback connector、Profile/JAR/Clone/identity 闭合后写入 | Java 单测 |
| FCA-05 | Adapter 固定 1170/2340 顺序，拒绝 Bundle/fixture/report、Ready、callback、timeout、shutdown 和 base drift | Node 定向测试 |
| FCA-06 | 生产 Web 为 attempt-local、无 Vite/fallback，关闭后端口清零 | Node 定向测试 |
| FCA-06A | capture geometry 只枚举语义 Cell，X6 装饰 Cell 不重复计数 | Vue 组件测试 + Node callback 测试 |
| FCA-07 | 03B 主链调用 Adapter，且成功/失败均不写 Approval/approved/Manifest | Author 定向测试 |

最少执行：

```text
npm run release:canvas06:golden:family-capture:schema:test
npm run release:canvas06:golden:family-capture:test
npm run release:canvas06:golden:author:test
mvn -f services/local-runtime/pom.xml -Dtest=ReleaseGoldenAuthoringLaunchModeTest,GoldenFamilyCloneRunnerTest,GoldenFamilyRuntimeReadyWriterTest test
npm run contract:validate
git diff --check
```

首次完整 `1170/2340` 受控调度可作为 FCA-05 补充证据，但不等于真实 candidate。性能阈值仍为主设计的单 attempt `<=5s`、总 `<=180min`、RSS `<=4GiB`；无法完整执行时必须如实记录。

## 6. 回滚与完成定义

回滚仅撤销本规格 allowlist 中新增的 Family mode、Schema、adapter、测试和文档，不删除 materialization base、candidate、approved 或用户数据。完成要求 FCA-01 至 FCA-07 由 checklist 记录实际命令和结果；之后 03B 仍需实现真实 capture callback、Common integration、candidate writer 和真实 release 输入，不能提升任何发布状态。
