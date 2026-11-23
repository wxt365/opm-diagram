# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/initial-generation-timeout-spec.md

边界确认：初始生成计时与迟到通知，相关测试/文档；不放宽检查。

- [x] GEN-01：初始harness.run使用runStage，15ms配置挂起用例返回GENERATION_TIMEOUT。
- [x] GEN-02：原迟到预览用例通过，超时后拒绝写入；通知检查stageError。
- [x] GEN-03：已存方案blocked保留、项目任务释放、Harness关闭移除、新工厂重试恢复ready且零模型写入。
- [x] GEN-04：助手service整文件+审查范围/规则62/62通过，正常结束无挂起；git diff --check通过。

服务重启健康与LAN页面200。测试使用临时会话和模拟模型工厂，未调用真实供应商或提交用户模型。
