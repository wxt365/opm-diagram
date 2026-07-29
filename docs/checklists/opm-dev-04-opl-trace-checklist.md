# Task Checklist: OPM DEV-04 M08 OPL Planner/Generator/Trace

## Spec Mapping

- 规格：`specs/opm-dev-04-opl-trace-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`
- 目标：P0 Consumption OPL、token、Trace、digest 的确定性链路。
- 范围：`local-runtime/**/text/**`、测试、规格和 checklist。
- 非目标：完整模板/规则/提交/API/前端/持久化。
- 验收：G-OPL-001/002、失败 code、重放一致、根级验证。
- 回滚：删除新增纯内存文本内核；无数据/API 回滚。

## 分析

- [x] 阅读 Planner/Generator/Composer/Trace 合同、Text/Trace 字段和测试策略
- [x] 确认 DEV-03 可提供 Revision/Fact/Context/Occurrence
- [x] 确认当前 Grammar 资产只有 mapping，完整模板正文不在资产中

## 实现与测试

- [x] 实现不可变计划、token、artifact、trace 和错误 code
- [x] 实现 Consumption P0 planner、generator、composer、trace、digest
- [x] 覆盖 G-OPL-001/002、重放、binding/template/context/trace 失败路径
- [x] 检查公开 API 无 Jackson/JDBC 或可变集合泄漏

## 验证与交付

- [x] 执行定向文本领域测试、Java 21 根级 verify、contract validate、diff check
- [x] 人工核对本包未修改 contracts/Profile/Grammar/V1/API/前端
- [x] 输出 Acceptance Mapping、兼容性影响、文件、验证与风险
