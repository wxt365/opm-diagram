# Spec: OPM DEV-04 M08 OPL Planner/Generator/Trace

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 目标

基于 DEV-03 的不可变 `SemanticRevision`，实现 P0 受控 Consumption OPL 的 Planner、Template Generator、Composer、Text Trace 与 SHA-256 artifact digest。`G-OPL-001` 与 `G-OPL-002` 必须可重复生成。

## 2. 范围与非目标

包含 `services/local-runtime/**/text/**` 及测试、本规格和 checklist。只支持单个 `SYSTEM_DIAGRAM` Context 中 `CAP-CONSUMPTION-001` 的 Object -> Process 与 Object State -> Process 形式。

不修改 contracts/Profile/Grammar 文件、V1、API、前端或持久化；不实现完整 16/8/10 关系、合句、Rule AST、提交原子事务、Finding 或完整 Grammar 模板资产。

## 3. 设计输入

- `docs/design/opm-symbol-and-text-generation-implementation-contract.md` 第 7 至 10 节。
- `docs/design/opm-core-metamodel-field-schema.md` 第 8 节。
- `docs/design/opm-test-strategy.md` 第 5、6.2 节。
- `docs/contracts/examples/minimal-iso-revision.json`、代表 Grammar mapping。

## 4. 方案要求

1. `SentencePlan`、token、sentence、artifact、trace 均为不可变值；不暴露 Jackson/JDBC。
2. Planner 仅接受存在的 `SYSTEM_DIAGRAM`，按 `grammar precedence + process stable ID + fact stable ID + sentence ID` 确定排序。
3. 对无 State 的 Consumption 生成 `Processing consumes Raw Material.`；存在 owner 正确的 State qualification 时生成 `Processing consumes available Raw Material.`，使用 ASCII 句点。
4. Grammar binding 的 id/version/digest 必须与 Revision binding 精确相同；缺模板、未知 Capability、非 P0 Context 或 Trace 缺失返回稳定 `OplGenerationException` code，不产生 artifact。
5. Trace 至少闭合 Fact、输入 Element、相关 Occurrence、Sentence 与 token range；同 Revision 和 Grammar 重放必须得到相同 sentence ID、文本、trace 和 digest。
6. 当前 Grammar 资产只声明 mapping，模板正文采用已冻结 P0 合同；不据此声称完整 Grammar/ISO 执行能力。

## 5. 验收与验证

1. `G-OPL-001/002` 文本字节精确匹配，token range 与 Trace 完整。
2. 重放输出完全一致；State owner mismatch、非 Consumption、非 SD、binding mismatch、缺模板和 Trace 缺失均有失败测试。
3. Java 21 定向测试、根级 verify、contract validate 与 diff check 通过。

## 6. 回滚与风险

本包无 API、数据库或文件写入；回滚删除新增 text 内核与测试。完整模板族、真实 Grammar digest/内容验证、Rule 执行和原子提交分别留给 DEV-01 资产闭包增强、DEV-05 与后续完整画布包。
