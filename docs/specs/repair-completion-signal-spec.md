# 修正完成信号

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：保留修正前报告和进度；新增finish_repair使已接受的完整修正版进入重新校验，不等待模型尾部。允许修改助手tools/service/plan-finalizer/review-diagnostics/harness插件与SDK、Skill及版本、对应测试和本规格清单。禁止API/schema/依赖/权限扩大/模型数据/.harness变化。

验收：FIX-01 旧诊断独立保存且不作本轮通过证据；FIX-02 finish_repair仅自动修正阶段、有变更且无失败步骤可用；FIX-03 持久化完成后通知重新审查，迟到写入、停止及版本冲突仍拒绝；FIX-04 进度/次数/最后工具/状态可读。

计划：阶段等待模型结果或显式修正完成信号，正常结束兼容；保存触发报告与进度。测试异常尾部/挂起/无变更/错误步骤/停止/语义阻断，然后重启。回滚：恢复代码重启，不删诊断或模型。

阶段使用独立repair会话身份，后续修正不接受旧会话迟到工具。允许stage-runner记录修正失败状态；指导版本1.4.2，审查条款不变化。
