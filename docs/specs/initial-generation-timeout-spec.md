# 初始生成超时修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：初始OPD模型生成使用既有runStage计时，超时退出任务、关闭失败Harness、保留已暂存方案并拒绝迟到写入。允许service.mjs、对应service测试及本规格清单；禁止接口/schema/依赖/权限/模型数据/.harness变化。非目标：修改脑图生成或完成信号机制。

验收GEN-01 generationTimeoutMs生效，返回GENERATION_TIMEOUT；GEN-02 迟到预览不能写入；GEN-03已存方案保留blocked，释放项目任务、可新建Harness重试；GEN-04正常生成/审查/修正/确认回归。

计划：直接复用runStage包裹harness.run，迟到通知检查stageError；定向挂起测试后整文件回归，再重启。回滚：恢复service实现重启，不删数据。
