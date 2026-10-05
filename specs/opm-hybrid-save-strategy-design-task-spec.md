# 手动保存、自动保存与草稿恢复策略设计任务

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：design-module-docs (primary)。

状态：本任务限定设计变更；运行代码和数据库迁移由后继实现任务承接。

## 1. 目标与来源

用户已确认采用“编辑实时保护、手动保存、10 秒自动保存、按需保留历史版本”。冻结保存去重、调度、草稿身份、异常恢复、永久引用及历史保留边界，替代每次编辑都形成完整历史修订的目标策略。

## 2. 范围与非目标

允许新增 `docs/design/opm-hybrid-save-and-draft-recovery-design.md`、本规格、对应 Checklist、`specs/opm-hybrid-save-strategy-implementation-task-spec.md`；允许同步应用 API 契约、逻辑持久化契约、模块设计、工作台状态模型、组件交互、冻结基线和 docs/README.md。

本任务禁止修改 Java/Vue、OpenAPI/JSON Schema/生成器、DDL、依赖、发布证据和用户数据。不建立 worktree，不清理旧 Revision，不改写无关未提交差异。

## 3. 契约影响

目标架构是 L3 变更：新增草稿读写身份和保存协议；旧 v1 Revision 协议继续适用未迁移模型和历史读取。禁止在旧 committed_revision 字段塞入草稿序号，禁止仅隐藏版本或放宽 SQLite 不可变触发器冒充存储优化。策略冻结不等于机器 Schema 已生成、功能已实现或迁移已通过。

## 4. 验收

- HS-D01：三层存储、10 秒期限、手动优先和内容去重有唯一口径。
- HS-D02：编辑/保存/恢复/压缩原子边界与幂等、并发、失败路径闭合。
- HS-D03：全部 OPD、布局、OPL/Trace、永久链接、Snapshot/Baseline 与新旧模式边界明确。
- HS-D04：迁移、回滚、保留规则、实现切片与正反例验收可执行；不宣称未验证的性能收益。
- HS-D05：关联文档包含精确优先规则、实现状态和链接；本任务链接、关键规则与 whitespace 检查通过。

## 5. 验证与回滚

对规则进行场景演算，检查新增文档链接、验收 ID 与旧契约适用范围；执行 git diff --check。没有代码变更，不运行应用测试或迁移，也不将文档检查表述为运行证明。回滚仅撤销本轮文档增量，运行数据无变化。
