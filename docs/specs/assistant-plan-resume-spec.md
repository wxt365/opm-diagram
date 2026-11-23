# 受阻方案恢复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：继续对话时恢复同版本未提交的受阻整图，保存失败步骤并提供修正工具；上游中断后保留方案，提示继续重试。非目标：修改模型网关、自动重放请求、跳过最终检查、修复会话初始化。

允许修改 apps/assistant/src/{service,tools}.mjs、对应 service 测试及本规格/清单。允许增加内部 JSON 的可选失败诊断字段，不改变公共 API、数据库 schema、依赖、安全守卫或其他模块；禁止修改用户数据与 .harness。

验收：RES-01 同草稿版本 ready/blocked 整图恢复步骤、命令身份，重新校验；RES-02 失败诊断持久化且 read_model 可见，修正成功才清除；RES-03 取消/已应用/待回执/过期方案不复用；RES-04 HTTP/2 中断保留方案并明确提示重试，未修正或审查失败不能确认。

计划：恢复后先重新预览生成新提案，允许 OPD 恢复轮 revise_plan；旧 PLAN_INCOMPLETE 缺诊断时要求完整替换修正。定向验证恢复、失败、版本边界与既有方案校验，再重启健康检查。持续上游故障仍会失败，不自动重放工具请求。

回滚：恢复本次代码后重启；可选诊断字段可忽略，保留所有数据。
