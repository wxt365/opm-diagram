# 对话式智能建模设计 Checklist

Work Mode：change；Risk Level：L1；Task Type：feature；Active Playbooks：design-module-docs (primary)。

## Plan

### Lean Spec

目标：将用户已讨论的 Harness 智能助手方案写入候选设计，补齐父子 OPD 的跨图语义、对话归属和修改边界。

非目标：本轮不实现助手、不调用模型、不冻结新 API 或改变现有开发准入。

允许范围：本 Checklist、`docs/design/opm-conversational-modeling-design.md`、`docs/README.md`、`docs/design/opm-modeling-workbench-page-design.md`；只增加设计及入口说明。禁止修改源码、测试、API/Schema、配置、依赖、用户数据、其他仓库与 `.harness/`。

契约影响：本轮无运行契约变化。后续提案执行、持久会话映射、整组提交及撤销属于待设计/验证能力，不表述为已有实现。

验收：DOC-01 覆盖目标、架构、会话和上下文；DOC-02 区分图内布局、共享语义、父子细化及跨图操作；DOC-03 明确并发、失败、恢复、验收和待定项；DOC-04 入口可达、相对链接存在、差异格式通过，既有冻结范围不变。

验证：逐项阅读设计，自动检查本次新增链接、关键边界和 `git diff --check`；纯文档变更不运行产品测试，不把设计验收场景标为执行通过。

回滚：仅撤销本轮四份文档的增量。

### 实施顺序

1. 根据现有 Runtime 与已读取 Harness 源码整理候选设计。
2. 用父子图案例定义读取、影响、授权与提交的差别，再补异常和验收。
3. 接入文档索引和页面设计的候选指针，检查一致性及链接。

## Checklist

规格引用：本文件 `Plan#Lean Spec`。

边界确认：已确认只修改上述四份文档；工作区初始干净，OPM HEAD 为 `a9461e9`，Harness HEAD 为 `5badb15009`。候选设计不覆盖现有冻结设计。

- [x] DOC-01
- [x] DOC-02
- [x] DOC-03
- [x] DOC-04

## 验证记录

2026-10-04：逐项核对设计，DOC-01 至 DOC-03 的内容已覆盖；DOC-04 检查通过：四份文档格式、六个本次相对链接、六项实现验收及关键边界检查、`git diff --check`。变更路径仅为允许的四份文档。未运行产品测试、浏览器或模型调用；AI-01 至 AI-06 是待实施验收，不属于本轮通过结果。

2026-10-05：后续第一版实施及运行验证另见[实现检查记录](opm-conversational-modeling-implementation-checklist.md)，不改写上述设计阶段验收。
