# State 编辑确认值同步与输入法保护

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。repo-profile、bugfix task-type 文件不存在。

目标：撤销/重做和外部改名回读后同步未被用户修改的 State 名称及角色，保留真实脏输入；中文组合输入期间不提交或离开编辑器。
非目标：改变历史或命令语义、重构其他编辑器。允许相关前端 State store helper、检查器及测试、使用文档和本任务 specs；依 AGENTS 更新既有 Failure。禁止公共 API/schema/配置/依赖/后端和无关修改，保留全部先前工作。
契约：不改公共 API，仅同步内部编辑缓冲与已确认字段。

验收：
- AC1：State A→B 保存→撤销 A→保存/切换不重提 B；重做及外部改名/角色回读同步。
- AC2：回读逐字段保留未提交/失败输入，其他未改字段正常同步；切换 State 初始化正确。
- AC3：compositionstart 后显式保存、统一提交/关闭被阻止，组合状态受离开保护；compositionend 后使用最终文字正常保存。
- AC4：定向、前端全量、lint、类型/构建通过。

验证：使用草稿命令/历史夹具验证真实 store 回读与检查器操作，组合事件组件测试；不将模拟事件宣称为真实输入法浏览器验证。回滚仅本轮增量。
