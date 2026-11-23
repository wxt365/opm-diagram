# 过程边界抽象与修正计时

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: feature; Active Playbooks: none (primary).

目标：显式abstract_boundary的过程重组下沉内部过程，子图保留原始事实及外部端点，父图生成可追溯父过程边界关系；多图修正按实际工作量计时。允许修改重组步骤生成契约及产物、DraftSubgraphReorganization/DraftModelPlan、投影来源字段、助手工具/Skill/审查上下文/计时和对应测试及本规格清单。允许新增可选契约字段和source provenance值；不改DB/schema结构、不增依赖、不删原语义事实、不直接改用户模型、不改.harness。

范围：仅PROCESS父元素；二端点未带标签/修饰器的Consumption、Result、Agent、Instrument、Invocation。仅替换边界事实中的内部PROCESS端点为父PROCESS，其他角色/身份不变；来源保留原fact_id。调用父过程自身不生成父图自调用，原调用留子图。无法安全映射的关系拒绝，不猜测语义。默认开关false兼容原模式。

验收：BND-01 主图内部过程下沉、子图事实与端点闭合；BND-02 原fact身份保留、父边界可追溯；BND-03 稳定预览/原子提交/失败回滚；BND-04 多图修正至少180秒至最多600秒，显式repairTimeoutMs优先；BND-05 审查收到来源和限制，ERROR不放行。

计划：复用source provenance表达派生事实；生成契约和审查同步；修正计时复用冻结快照工作量。真实MVC、助手定向、typecheck/生成检查后重启。回滚：恢复代码契约重启，不删数据；旧暂存方案需显式启用新开关后重审。
