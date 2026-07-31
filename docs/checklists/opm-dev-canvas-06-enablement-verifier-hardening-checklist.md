# Task Checklist: DEV-CANVAS-06 Enablement Verifier 守卫加固

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-enablement-verifier-hardening-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`testing (primary)`
- 目标：关闭 Enablement verifier 派生状态、Activation 前置证据和不可变写入缺口。
- 范围：Enablement runner/test/Schema 与状态文档同步。
- 非目标：不实现 GATE-06-03~06，不生成真实 Candidate/Activation，不启用 Capability。
- 约束：测试资产只存在于 `/tmp`，生产 gate 保持 `DISABLED + []`。
- 验收标准：当前规格第 5 节。
- 验证方式：当前规格第 6 节。
- 回滚：只回退本任务增量，保留用户既有未提交实现。

## Reproduce

- [x] 现有 Enablement test `2/2 PASS`
- [x] 确认 verifier 未完整复算 Candidate 派生字段
- [x] 确认正向测试直接构造最小 GATE-06-06 READY JSON
- [x] 确认输出写入允许覆盖已有 manifest

## Build

- [x] 增加篡改 Candidate 失败测试
- [x] 增加 Activation 缺少 exact Schema/READY Report 失败测试
- [x] 增加重复输出不可覆盖失败测试
- [x] verifier 复算 Candidate 派生状态和集合
- [x] Activation 严格执行 GATE-06-06 Schema/ref 前置守卫
- [x] manifest 改为排他创建
- [x] 同步 GATE-06-02 checklist 和符合性报告状态

## Verify

- [x] Enablement 定向测试 `4/4 PASS`
- [x] Intake 回归 `2/2 PASS`
- [x] 契约校验通过
- [x] 仓库内无 Candidate/Activation/Rollback 新产物
- [x] 文档状态和限制一致性检查通过
- [x] `git diff --check` 通过
