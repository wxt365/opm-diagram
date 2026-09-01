# Checklist: GOLDEN-AUTHORING-03B Family Capture Adapter 实现

> 状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`。本清单仅记录 Family Adapter 实现；不构成 candidate、approval、release、GATE-06-03、Capability 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-authoring-family-capture-adapter-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标/边界/修改范围/约束/验收/回滚：规格第 1、2、3、4、5、6 节。

## Boundary

- [x] Family 与 Common Adapter machine contract、identity、clone/ready artifact 和 storage 路径隔离。
- [x] Family fixture 原件唯一来自 Plan 锁定 Bundle archive entry；Context 唯一来自 archive fixture `model_header.root_context_id`。
- [x] `base-storage-root` 是 Family Clone 唯一的 Materialization Report 解析锚点：固定 `<root>/fixtures/<fixture-key>/storage`、物理 `reports/<fixture-key>.json` 与逻辑 `materialization/reports/<fixture-key>.json`，禁止扫描或 fallback。
- [x] `GoldenFixtureMaterializationException.exitCodeFor()` 是 Family mode/Clone/Ready 唯一退出码 owner，仅允许新增 Family `2/3/4` 映射。
- [x] Author preflight 固定消费 `--web-dist`，将其 tree digest 与 Plan 精确 join，并向 Adapter 返回 materialization/Java/JAR/Profile/Web 五项 sealed realpath。
- [x] Family Bundle 只能以 exact Java 21 sibling `bin/jar` 列举及解包到 fresh attempt-local root；Plan allowlist、entry 与 raw-ref 校验前禁止创建 storage。
- [x] Bundle 先在 Adapter work-root 的 `verified-bundle` 完成全局 entry/fixture/raw-ref 验证；验证失败零 attempt root，attempt 仅复制已验证 fixture。
- [x] Family callback 的 Invocation、Observed Result、Adapter Result 三份 Schema 与 JCS 摘要已冻结；callback 无路径或生命周期控制权。
- [x] capture geometry 只使用 `data-opm-capture-cell-id`：节点和 Fact 各一个；X6 `data-cell-id` 自动包含的终态描边、默认状态箭头和 fan 装饰不得进入 `expected_cells` 计数。
- [x] 已冻结两个 launch mode、三份 Schema、固定关闭顺序和错误码。
- [x] 修改 allowlist 不含公共 API、SQLite DDL、除语义 capture anchor 外的 Vue 产品行为、E2E Runner、production Web server、Approval/Publisher/Manifest 或依赖。

## Build

- [x] FCA-01：Family mode 与互斥 command-line guard 实现；Java 21 `ReleaseGoldenAuthoringLaunchModeTest` 2/2 PASS。
- [x] FCA-02：Family Identity、Clone Result、Runtime Ready Schema 与 Schema test 实现；Node Schema test 3/3 PASS。
- [x] FCA-03：Family Clone CLI/atomic result 与 Java 单测实现；Java 21 `GoldenFamilyCloneRunnerTest` 2/2 PASS。
- [x] FCA-04：Family Web Runtime Ready/atomic result 与 Java 单测实现；Java 21 `GoldenFamilyRuntimeReadyWriterTest` 2/2 PASS。
- [x] FCA-05：Node Adapter 的全局 Bundle staging、Identity、固定 1170/2340 循环与 callback/input 失败边界实现；Node 定向测试 3/3 PASS。
- [x] FCA-06：Adapter 通过 production Web owner、Runtime SIGTERM/port 和 base-tree 关闭路径实现；Bundle preflight 负例已验证。真实 Chromium capture 仍由后续 03B callback 实现规格闭合。
- [x] FCA-06A：`OpdCanvas` 语义 capture anchor 与 Family callback selector 的组件/Node 回归通过；`apps/web` Vitest 1/1 PASS，Node 3/3 PASS。
- [ ] FCA-07：03B main chain只在Family/Common均成功后继续且零越权输出实现。

## Verify

- [x] `npm run release:canvas06:golden:family-capture:schema:test`：4/4 PASS。
- [x] `npm run release:canvas06:golden:family-capture:test`：2/2 PASS。
- [x] `npm run release:canvas06:golden:author:test`：9/9 PASS。
- [x] Java 21 `mvn -f services/local-runtime/pom.xml -Dtest=ReleaseGoldenAuthoringLaunchModeTest,GoldenFamilyCloneRunnerTest,GoldenFamilyRuntimeReadyWriterTest test`：6/6 PASS。
- [x] `npm run contract:validate` 与 `git diff --check` 通过。
- [ ] 完整 `1170/2340` 受控运行与性能证据记录，或明确未运行原因。

## Residuals And Rollback

- [ ] 真实 candidate capture、Authoring Report、Approval、Publisher 和 Visual Manifest 仍为后续 03B/04/05 范围。
- [ ] 回滚仅限本包新增代码、Schema、测试和文档；不删除输入或发布资产。
