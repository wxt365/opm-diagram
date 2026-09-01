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
- [x] 已冻结两个 launch mode、三份 Schema、固定关闭顺序和错误码。
- [x] 修改 allowlist 不含公共 API、SQLite DDL、Vue、E2E Runner、production Web server、Approval/Publisher/Manifest 或依赖。

## Build

- [x] FCA-01：Family mode 与互斥 command-line guard 实现；Java 21 `ReleaseGoldenAuthoringLaunchModeTest` 2/2 PASS。
- [x] FCA-02：Family Identity、Clone Result、Runtime Ready Schema 与 Schema test 实现；Node Schema test 3/3 PASS。
- [ ] FCA-03：Family Clone CLI/atomic result 与 Java 单测实现。
- [ ] FCA-04：Family Web Runtime Ready/atomic result 与 Java 单测实现。
- [ ] FCA-05：Node Adapter 的 Bundle/Report/fixture identity、1170/2340串行和失败边界实现。
- [ ] FCA-06：attempt-local production Web、Browser/Runtime关闭、port/sidecar/base digest证明实现。
- [ ] FCA-07：03B main chain只在Family/Common均成功后继续且零越权输出实现。

## Verify

- [ ] Schema test 通过。
- [ ] Family Adapter 定向 Node test 通过。
- [ ] 03B Author 定向 test 通过。
- [ ] Java 定向 tests 通过。
- [ ] `contract:validate` 与 `git diff --check` 通过。
- [ ] 完整 `1170/2340` 受控运行与性能证据记录，或明确未运行原因。

## Residuals And Rollback

- [ ] 真实 candidate capture、Authoring Report、Approval、Publisher 和 Visual Manifest 仍为后续 03B/04/05 范围。
- [ ] 回滚仅限本包新增代码、Schema、测试和文档；不删除输入或发布资产。
