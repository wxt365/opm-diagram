# Checklist: DEV-CANVAS-06 Common Visual Root 44-File Inventory 闭包修正

状态：`IMPLEMENTED/NOT_RELEASE_VALIDATED`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-visual-root-inventory-closure-bugfix-task-spec.md`。
- Task Type：`bugfix`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 目标、冻结布局和历史边界：规格第 1 至 3 节。
- 修改/禁止边界：规格第 4 节。
- 验收、回滚与证据边界：规格第 5 至 7 节。

## Checklist

- [x] C01 复现：Adapter Test Input Builder 正例被 Bundle Schema `file_count=43` 拒绝。
- [x] C02 确认 Common Fixture Builder 与只读 verifier 的唯一活动布局为 44 文件，且含 Common Setup Plan。
- [x] C03 活动设计、规格、checklist 和索引统一到 `44=1+8+32+2+1` 与 Bundle `341`；其余43-file历史记录由当前规格显式取代。
- [x] C04 Bundle Schema、Builder/Verifier/Test 固定并验证 44-file Common tree。
- [x] C05 Builder staging/installed 正例和篡改反例通过：`node --test scripts/build-canvas06-common-visual-adapter-test-input.test.mjs`，`3/3`。
- [x] C06 已记录03C仅恢复受控输入实现资格；未提升 Candidate、Gate、Capability 或 ISO 状态。

## 风险与遗留项

- 历史 43-file root 的原始 SHA 和执行记录不能改写；它们不是活动 44-file root 的验证证据。
- 此闭包只解除 Adapter Test Input 的输入矛盾，不等于 03C Node adapter、fault hook、8 base/144 clone 或后续七项功能已实现。
