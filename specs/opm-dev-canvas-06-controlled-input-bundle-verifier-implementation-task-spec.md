# Spec: DEV-CANVAS-06 受控输入 Bundle 验证器实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现只读 `CONTROLLED_TEST` descriptor 验证库，为独立 Visual `0.2` 与 E2E `0.1` builder 提供共同的前置输入守卫。验证器不生成 Manifest、Report 或临时输出。

## 2. 设计输入

唯一业务输入为 `specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md` 第 6.1 至 7 节，以及 `opm-dev-canvas-06-controlled-input-bundle.schema.json`。前一 Schema 实现规格只定义静态形状；本规格落实其中第 5 节保留给语义守卫的模式、identity、目录和 raw ref 闭合。

## 3. 修改边界

允许新增：共享验证库、其单元测试、本规格/checklist 与定向 npm 命令。禁止修改既有 Manifest/Report Schema、产品 API、SQLite、Vue、Profile/Rule/Grammar/Symbol、Golden approved bytes、生产 evidence、builder、Candidate、Activation 和 `.harness/**`。

## 4. 验证契约

`verifyControlledInputBundle({ bundleRoot, consumer })` 必须只接受 `consumer=VISUAL|E2E`，并在无写入的情况下依次完成：

1. root 和 `controlled-bundle.json` 均为非 symlink；root basename 与 `canvas06-controlled-<sha256>` 规则一致；
2. descriptor 必须通过 `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.1` Schema；
3. basename、`bundle_id`、`bundle_identity_sha256` 与 `sha256(JCS({bundle_class,handoff_ref,intake_report_ref,evidence_bundle_ref,approved_version_ref}))` 完全相等；
4. `handoff_ref`、`intake_report_ref`、`evidence_bundle_ref` 只能定位 root 内非 symlink 常规文件，且 raw byte length/SHA-256 与 ref 相等；
5. `consumer=VISUAL` 时 `approved_version_ref` 必须是对象；其 version root 为非 symlink 目录、basename 等于 `golden_set_version`，`authoring_report_ref.path` 恰为 `<path>/authoring-report.json` 且 raw ref 闭合；
6. `consumer=E2E` 时 `approved_version_ref` 必须显式为 JSON `null`，不得读取任何 approved 文件。

任一以上失败均为输入/Schema/ref/root/class 非法，抛出 `ControlledInputBundleError`，`exitCode=2`。验证器不得处理生产 root、不得生成输出，也不得把 Visual approved object 解释为完整 Golden Authoring exact join；后者属于 Visual builder 的冻结职责。

## 5. 测试与验收

测试必须在临时目录构造真实 raw ref，并覆盖：Visual 成功、E2E 成功、两个 consumer 的 descriptor/ID 不同、consumer 非法、模式错配、identity 或 basename 不闭合、raw archive 篡改、symlink root/entry 拒绝。执行：

```text
npm run release:canvas06:controlled-input-bundle-verifier:test
npm run release:canvas06:controlled-input-bundle-schema:test
npm run contract:validate
git diff --check
```

## 6. 兼容与回滚

不改变公共 API、运行配置或既有 Schema。回滚仅删除本任务新增库、测试、命令、规格与 checklist；后续 builder 尚未实现时 GATE-06-03 继续为 `BLOCKED`。

## 7. 事实与假设

事实：受控 descriptor Schema 已实现并验证；独立 Visual/E2E builder 尚未实现。假设：受控 bundle 的三个顶层 ref 和 Visual approved Authoring Report 均作为 descriptor root 内相对 raw ref 存放；这是 Schema 的安全相对路径和“descriptor、目录、refs、raw archive SHA 闭合”冻结规则的直接实现。
