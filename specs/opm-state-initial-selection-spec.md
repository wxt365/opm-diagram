# State 默认选择初始化

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。repo-profile、bugfix Task Type 文件不存在。

目标：首次加载和只读版本中 State 为首项时，最终默认选择的编辑缓冲正确；普通回读保留当前 State 脏输入，自动选择变为其他 State 时初始化新目标。
非目标：改变默认选择顺序、公共契约或历史语义。允许相关 runtime 实现、前端回归测试、使用文档及本任务 specs，依 AGENTS 更新既有 Failure 记录；禁止公共 API/schema/依赖/配置/后端及无关修改，保留既有工作。
契约影响：仅内部加载初始化参数，不改变公共接口。

验收：AC1 草稿 State 首项直接开面板名称/角色正确，保存/关闭/切换不误提交；AC2 只读 State 首项和新加载覆盖旧编辑缓冲；AC3 同目标普通回读仍保留未提交输入并保留前轮撤销同步；AC4 定向、全量前端、lint、类型与构建通过。
验证：真实加载及草稿回读夹具，State 在 owner 前，重复加载及检查器保存/关闭/选择；先定向后全量。回滚仅撤销本任务增量。
