# 助手 Skill 逻辑对齐

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: refactor; Active Playbooks: none (primary).

目标：把现有建模 Skill 的本图优化、非阻断质量建议和续聊需求保留落实到运行上下文。允许修改助手 service/tools/plan-finalizer、新增优化上下文模块及测试、本规格与清单；禁止新增工具权限、跨图重组、API/schema/依赖/质量阈值/用户模型数据/.harness 变化。非目标：自动删减图、自动确认、自然语言任务分类器。

验收：ALIGN-01 read_model 明确允许命令及子图/删除能力边界；ALIGN-02 按当前或暂存图提供节点/关系数量及优化指导，密度只作非阻断建议；ALIGN-03 续聊保留原审查需求并附加本轮要求，恢复诊断和同版本校验不变；ALIGN-04 现有生成/审查/一次确认权限不扩展。

计划：复用 existing Skill 与 allowed 命令集合，返回本图优化事实及指引；恢复时保留 reviewRequest，最终审查使用完整累积需求。审查快照模块 review-scope.mjs 及对应测试也纳入允许范围，以确保独立审查实际收到原需求。验证上下文、续聊需求、既有流程回归。回滚：恢复本次实现后重启，不删除用户数据。
