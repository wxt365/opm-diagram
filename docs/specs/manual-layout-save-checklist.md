# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/manual-layout-save-spec.md

- [x] 边界确认：只修改上述前端保存/布局 owner、对应测试与文档；后端契约不变；保留既有用户修改。
- [x] 复用：captureLayouts、UPDATE_LAYOUT_BATCH、execute、requestSave、useDialogFocus。
- [x] M01–M06 实现和验证：最终船舶浏览器 10 项 PASS，见 tests/system/output/manual-layout-2026-10-12T07-24-33-039Z/report.json。
- [x] 单元回归：51 个文件、440 个测试 PASS（工作台 99 项）；完整日志 tests/system/output/manual-layout-unit-regression.log。
- [x] typecheck 和 lint 均执行成功；两个系统脚本 node --check 成功，git diff --check 成功。
- [x] 故障路径：布局拒绝保留本地位置；SAVE 失败不重复布局；响应丢失按收据恢复、禁用再次保存、恢复后不重复布局；迟到/跨模型保护保持。
- [x] 当前船舶原模型完整 SHA-256 前后一致；只写新验收副本。
- [x] 行为文档及原船舶验收脚本拖动断言同步；旧 38 项历史报告未改写，本次未重跑真实 AI 的全套旧旅程。
- [x] 性能边界：三次拖动零布局日志请求，手动保存一个批次；本次手动保存 6978ms，后端校验和保存整体耗时未优化。

首次浏览器检查暴露“已提交布局响应丢失后本地标记未清理”问题，已修正并新增回归。另一试跑误点待确认状态的禁用保存按钮，验收脚本已改为验证禁用状态。最终完整 10 项以以上输出目录为准。
