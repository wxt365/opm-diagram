# 构造操作与历史快捷键提交保护

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。repo-profile、bugfix task-type 文件不存在。

目标：菜单请求、细化、删除、关系双击必须等待统一输入提交；快捷键与工具栏复用历史操作入口，保留输入框原生撤销。
非目标：变更命令契约、历史语义、折叠策略或后端。
允许：相关工作台组件、导航 helper 及测试、使用文档、本任务 specs，按 AGENTS 更新既有 Failure 记录。禁止公共 API/schema/配置/依赖/后端及无关重构；保留所有既有修改。内部 helper 契约可增加回调，公共嵌入接口不变。

验收：
- AC1：State 提交失败/进行中时菜单、直接删除、细化与关系双击不能越过提交；确认成功后继续，导航变化取消旧操作。
- AC2：Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z 复用工具栏提交检查；失败不恢复历史，输入框维持原生撤销，非 OPD/只读/输入法/重复事件约束保留。
- AC3：定向与完整前端测试、lint、类型和构建通过。

验证：实际组件事件与点击、导航 helper 快捷键回调测试，定向后全量回归。回滚仅撤销本任务增量。
