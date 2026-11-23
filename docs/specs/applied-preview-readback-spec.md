# 确认后的预览回读

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：确认应用到正式模型后保留预览和所选子图，待回读成功后切换，失败明确提示可重试。允许修改AssistantPanel/WorkbenchView及对应测试、本规格清单；禁止后端/API/schema/依赖/模型数据/.harness改动。非目标：改变存储或确认审查。

验收READ-01申请中/回读中忽略自动清预览；READ-02成功读回所选子图后清除预览；READ-03回读失败保留预览并提示只重试读取，不重复apply；READ-04项目/模型离开防止迟到回读影响其他页面。

计划：面板发应用状态事件，父组件管理异步回读生命周期和错误/重试；真实图回读成功才切换。测试延迟/失败/目的子图和现有面板流程。回滚：恢复前端实现，无数据迁移。

允许补充usePreviewViewport.ts及测试：确认成功保留当前子图视口，取消仍恢复旧视口。
