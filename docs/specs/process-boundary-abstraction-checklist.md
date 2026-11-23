# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/process-boundary-abstraction-spec.md

边界确认：契约/派生事实来源/助手计时及诊断/测试文档；不删除语义事实或放宽审查。

- [x] BND-01：显式开关后内部过程下沉，子图外部端点闭合；false旧行为兼容，非PROCESS父和复杂边界拒绝。
- [x] BND-02：原事实保存于子图，父关系source provenance指向原事实，v2投影boundary_source_fact_id可审查。
- [x] BND-03：真实MVC稳定预览、一次提交、重复不变；完整草稿54/54通过，包含后置错误回滚。
- [x] BND-04：修正计时基于repairSnapshot，4图120图元435秒，显式repairTimeoutMs优先；计时/恢复10项通过。
- [x] BND-05：Skill1.4.1指导显式开关和业务范围，保留审查规则；契约/指导/审查38/38、typecheck与生成检查通过。

服务已重启。原三个拆图步骤仅在只读预览中开启两个PROCESS边界抽象：主图21节点47关系，其中18条有来源追溯；查询子图18节点30关系、分析10节点13关系、公司2节点1关系；平台阻断0。用户最新自动修正方案已缩为两步且未选择足够内部过程，不能直接重审就获得以上结果，需助手恢复三步并正确选定成员。未提交用户方案，未调用真实标准审查；公司普通关联细化语义及协调过程覆盖范围仍需审查。

完整修改范围：scripts/generate-draft-workspace-contract.mjs及其生成的docs/contracts/schema/openapi、前端generated/draftWorkspaceContract.ts、Java generated/DraftWorkspaceContract.java、resources/draftsave/draft-workspace-v02.schema.json；运行时DraftModelPlan/DraftSubgraphReorganization/DraftWorkspaceService及DraftWorkspaceControllerTest；助手harness-plugin/tools/modeling-context/stage-runner/plan-finalizer及对应review-diagnostics/service测试；两份Skill及guide/skill版本参考文件；本任务规格清单。原有业务事实保持，无DB结构迁移。
