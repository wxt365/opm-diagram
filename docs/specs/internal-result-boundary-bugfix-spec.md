# 内部产出边界修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: bugfix; Active Playbooks: none (primary).

目标：过程边界抽象不把本细化内部产生、内部使用的结果提升为父过程前置依赖。允许修改DraftSubgraphReorganization及对应ControllerTest、本规格清单；禁止契约/schema/依赖/权限/审查规则/用户模型数据/.harness变化。

边界：当前父图可见的CAP-ISO-PROC-002明确Result，生产过程在内部成员内且没有可见外部生产者时识别内部产出；其内部Instrument/Agent/Consumption只下沉、不派生父图输入。原Result和使用事实留子图；对外输出及其他外部使用保持。外部生产者或缺Result证据保守保留依赖。

验收INT-01内部产出使用不派生父前置、子图原事实保留；INT-02父输出与真正外部前置保持；INT-03预览/原子提交/重复/原模式兼容回归；INT-04用户方案只读预览验证，不提交用户数据。

计划：先扫描Result生产归属再派生边界，补真实MVC回归、完整草稿测试后重启。回滚：恢复实现重启，未提交方案重新预览，已存正文不删除。
