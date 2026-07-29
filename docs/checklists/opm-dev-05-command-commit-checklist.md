# Task Checklist: OPM DEV-05 M03/M06/M07 Candidate Revision Commit

## Spec Mapping

- 规格：`specs/opm-dev-05-command-commit-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`
- 目标：候选 Revision 的守卫、校验、OPL/Trace 和 SQLite 原子提交。
- 范围：`local-runtime/**/command/**`、必要语义 JSON 写入器、SQLite 提交适配器和测试。
- 非目标：V1/API/前端、Candidate Builder、完整规则/命令 union/基线。
- 验收：所有 P0 提交分区原子写入、失败无 partial、idempotency/guard 测试。
- 回滚：删除新增纯后端提交内核和测试；无 schema/API 回滚。

## 分析

- [x] 确认 V1 的 revision/head/operation/idempotency/finding/trace 表和约束
- [x] 确认 DEV-02 仅提供迁移和 schema 读取，尚无 Revision commit repository
- [x] 确认 DEV-03/04 的候选语义、校验和 OPL/Trace 可作为提交输入

## 实现与测试

- [x] 实现不可变命令、结果、Finding/Validation 和稳定失败码
- [x] 实现 guard、语义校验、文本生成和 idempotency 协调器
- [x] 实现 Revision JSON 写入器与 SQLite 单事务提交适配器
- [x] 覆盖成功、重放、guard、validation/text 阻断和 SQLite rollback
- [x] 检查公开 API 无 Jackson/JDBC 或可变集合泄漏

## 验证与交付

- [x] 执行定向测试、Java 21 根级 verify、contract validate、diff check
- [x] 人工核对本包未修改 V1/API/前端/契约资产
- [x] 输出 Acceptance Mapping、兼容性影响、文件、验证与风险
