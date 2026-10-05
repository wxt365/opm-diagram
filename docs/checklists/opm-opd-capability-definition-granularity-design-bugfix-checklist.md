# Checklist: OPD Capability 级关系 Definition 粒度设计修正

## Spec Mapping

- 规格：`specs/opm-opd-capability-definition-granularity-design-bugfix-task-spec.md`
- 验收：`OPD-CAP-DEF-01` 至 `OPD-CAP-DEF-08`
- 边界：只修改设计、规格、checklist 和索引；产品代码、API、Schema、配置、依赖、数据和发布工件保持只读。

## Design

- [x] `OPD-CAP-DEF-01` Procedural `16/16` 独立 Definition 已冻结。
- [x] `OPD-CAP-DEF-02` Control `8/8` 独立 Decorator 与 identity 不变量已冻结。
- [x] `OPD-CAP-DEF-03` Structural `10/10` 独立 Definition 已冻结。
- [x] `OPD-CAP-DEF-04` Capability 级接口、Registry 和 Decorator 组合已冻结。
- [x] `OPD-CAP-DEF-05` family helper、复用和影响隔离已冻结。
- [x] `OPD-CAP-DEF-06` 旧三 family production renderer 已历史化，双实现和 fallback 被禁止。
- [x] `OPD-CAP-DEF-07` 权威设计、handoff、索引和全局基线已同步。

## Verify

- [x] `OPD-CAP-DEF-08`：34 个 Capability ID 与 34 个唯一实现文件一一对应，文档链接、活动术语和差异检查闭合。
- [x] Control decorator 不产生第二 Fact、Occurrence、Relation Group 或 capture anchor。
- [x] 新增及受影响 Markdown 相对链接有效。
- [x] 当前活动文档不存在“按 family 查找唯一 production renderer”的冲突表述；旧三 renderer 只保留在明确被后继修正取代的历史记录中。
- [x] `git diff --check` 通过。

## Verify Record

2026-09-02：映射脚本复核 `PROC=16`、`CTRL=8`、`STRUCT=10`、唯一实现文件 `34`、内部诊断码 `9`；12 份新增及受影响 Markdown 共检查 95 个相对链接，全部存在。活动口径检索未发现按 family 选择唯一 production renderer 的残留；尾随空白检查与 `git diff --check` 通过。本记录只证明设计文档闭包，不证明 Vue/TypeScript 实现、构建、visual/E2E、性能或发布证据完成。
