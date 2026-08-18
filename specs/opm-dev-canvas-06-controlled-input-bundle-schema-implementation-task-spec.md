# Spec: DEV-CANVAS-06 受控输入 Bundle Descriptor Schema 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `CONTROLLED_TEST` 的 `controlled-bundle.json` 机器 Schema 与 AJV 正反例，冻结 `approved_version_ref` 为始终存在的对象或 JSON `null`。本任务只交付静态 descriptor 契约，不生成 bundle、Manifest、Report、Candidate 或 Capability 启用。

## 2. 设计输入

唯一业务输入为 `specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md` 第 6.2、6.4 和第 7 节，以及其中定义的 `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.1`。最新冻结决定优先于该规格的任何缺失回退表述：`approved_version_ref` 始终必填；Visual 使用对象，E2E 使用显式 `null`。

## 3. 范围与非目标

允许新增以下资产：

- `docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle.schema.json`；
- 定向 AJV 测试和根 `package.json` 测试入口；
- 本规格与对应 checklist。

禁止修改既有 Manifest/Report Schema、产品 API、SQLite、Vue、Profile/Rule/Grammar/Symbol、生产 evidence、Golden approved bytes、builder/verifier、Candidate、Activation 和 `.harness/**`。

## 4. 静态契约

Schema 必须封闭根对象，固定：

- `schema_id=OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001`；
- `schema_version=0.1`；
- `bundle_class=CONTROLLED_TEST`；
- `bundle_id=canvas06-controlled-<64 位小写 SHA-256>`；
- `bundle_identity_sha256` 为 64 位小写 SHA-256；
- `handoff_ref`、`intake_report_ref`、`evidence_bundle_ref` 为封闭文件引用；
- `approved_version_ref` 为必填，且仅能为封闭 `{path,golden_set_version,authoring_report_ref}` 或 JSON `null`。

所有路径必须是受控 bundle root 下的安全相对路径。`golden_set_version` 采用无 prerelease/build metadata 的 SemVer。Schema 不接受未知字段。

## 5. 分层边界

本 Schema 故意不判断调用方是 Visual 还是 E2E，也不重算 identity。后续独立 builder 的语义守卫必须在写任何 Manifest 或临时文件前完成：

1. Visual 拒绝 `approved_version_ref=null`；E2E 拒绝对象；
2. `bundle_identity_sha256=sha256(JCS({bundle_class,handoff_ref,intake_report_ref,evidence_bundle_ref,approved_version_ref}))`，并与目录 basename、`bundle_id` exact 相等；
3. Visual 与 E2E descriptor 和 `bundle_id` 不得复用；
4. 上述拒绝均以退出码 `2` 结束，零 Manifest 和零临时输出。

这些行为没有 builder 时不可执行，不得被本次 AJV 测试宣称已经实现。

## 6. 验收与验证

定向测试必须覆盖：对象成功、显式 `null` 成功、字段缺失、对象字段缺失、unsafe path、非法 bundle ID、unknown field。执行：

```text
npm run release:canvas06:controlled-input-bundle-schema:test
npm run contract:validate
git diff --check
```

## 7. 兼容与回滚

本任务不改变任何既有 Schema 或运行方式。回滚仅删除本任务新增 Schema、测试、npm 入口、规格和 checklist；不得修改 bundle、approved bytes 或 release evidence，GATE-06-03 继续保持 `BLOCKED`。

## 8. 事实与假设

事实：Visual/E2E 输入修正规格已冻结 descriptor identity 和 `approved_version_ref` 联合类型；当前尚未实现受控 descriptor、两个 builder 或语义 verifier。假设：无。
