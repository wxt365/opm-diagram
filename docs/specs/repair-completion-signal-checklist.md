# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/repair-completion-signal-spec.md

边界确认：助手修正信号/诊断/测试文档；不放宽最终审查或自动确认。

- [x] FIX-01：repairDiagnostics.previous_validation/previous_review独立保留，修正后当前review=null不丢历史原因。
- [x] FIX-02：finish_repair仅修正阶段，必须接受过变更且无失败步骤；普通生成阶段拒绝，无变更拒绝。
- [x] FIX-03：完成持久化后通知服务重新诊断审查；异常尾部/挂起不阻碍，迟到工具拒绝，独立repair会话避免旧阶段写入。
- [x] FIX-04：阶段开始/次数/接受变更数/最近工具和活动时间/完成或失败状态可通过plan_diagnostics读取。

服务定向9/9、审查规则/范围/HTTP21/21通过。服务已重启，助手/Runtime健康与LAN页面200。未执行真实模型修正，无法保证模型总会调用finish_repair，正常结束兼容且无完成仍有界超时。未自动提交用户方案。
