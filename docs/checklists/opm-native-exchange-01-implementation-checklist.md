# EXCHANGE-01 实现检查清单

状态：`VERIFIED_UNIT_SCOPE`

## Spec Mapping

| 规格项 | 实现边界 | 验收/验证 | 状态 |
| --- | --- | --- | --- |
| 目标 | `.opmp` ZIP、inspection、MODEL_REVISION adapter | AC-01/02 | 已通过定向单测 |
| 安全约束 | 路径、ZIP、大小、摘要、扩展、依赖 | AC-03 | 已通过定向单测 |
| 非目标 | 无 SQLite 写入、无 Project/Baseline adapter | AC-04 | 已通过定向单测 |
| 契约 | Manifest Schema/JCS/错误码 | AC-05 | 已通过 Schema/契约校验 |
| 回滚 | 无 DDL；删除新增模块 | 代码审查 | 已冻结 |

## 执行项

- [x] 冻结机器契约、任务规格与边界。
- [x] 新增 Manifest Schema 与 Schema 正反例验证。
- [x] 实现 ZIP Reader/Writer 及安全 inspection。
- [x] 实现 MODEL_REVISION adapter。
- [x] 编写定向 JUnit 正反例。
- [x] 运行 Node/Maven 验证和 `git diff --check`。
