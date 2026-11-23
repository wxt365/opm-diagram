# 结构关系方案方向修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：高层结构关系 CREATE_FACT 采用现有能力目录方向，解除 CAP-ISO-STRUCT-002 被误填 UNDIRECTED 的阻塞；助手保留已有 reason_code，支持定位失败。非目标：自动确认、跳过审查、改变关系语义或给缺标签关系编造标签。

允许修改 DraftModelPlan.java、DraftWorkspaceControllerTest.java、apps/assistant/src/runtime.mjs、对应新增测试及本规格/清单。允许内部错误对象诊断信息增强；禁止公共 API/schema/依赖、安全守卫、资产目录、用户模型数据、.harness 变化。

验收：STR-01 七条单向结构关联可预览、最终平台诊断、整组提交且重试不重复；STR-02 方向来自目录，过程方向保持兼容；STR-03 reason_code 保留在助手错误对象和可见消息中；STR-04 真实服务重启健康。标准审查由既有助手恢复流程执行，仍须用户一次确认，不在测试或修复中代替用户提交真实方案。

计划：复用 StructuralLinkCatalog，新增真实 MVC/存储测试与 RuntimeClient 错误回归；执行定向后端与相关助手测试，重启。回滚：恢复本次代码后重启，不删用户数据。
