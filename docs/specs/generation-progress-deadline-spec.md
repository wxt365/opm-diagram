# 生成进度计时与完成信号

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：初始生成持续成功暂存时不被固定180秒截断，默认总上限600秒、无有效进展180秒；新增受限finish_generation进入诊断审查。允许助手stage-runner/service/tools/harness插件与SDK、Skill及指导版本、对应测试和本规格清单。禁止API/schema/依赖/权限扩大/自动确认/业务模型直接修改/.harness变化。

验收PROG-01总上限不因进度刷新，无进展时限只因持久化成功且steps实际变化刷新；PROG-02显式generationTimeoutMs保持旧配置优先，generationIdleTimeoutMs可配置；PROG-03finish_generation仅生成阶段、完整有效方案且无失败步骤可用，存储成功后通知，迟到工具/通知拒绝；PROG-04超时保留方案、释放任务、真实多子图恢复与确认兼容。

计划：runStage生成专用双计时；service成功暂存回调；工具提交持久化完成状态，Promise.race进入检查。定向计时/权限/错误、完整回归；独立真实模型验收，不操作用户业务图。回滚：恢复助手实现重启，保留已有方案。
