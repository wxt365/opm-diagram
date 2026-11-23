# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/assistant-structural-plan-spec.md

边界确认：指定实现、测试及本任务文档；禁止契约/schema/依赖/用户数据/安全/.harness 修改。

- [x] STR-01：新增真实 MVC/临时数据库测试，七组端点预览及 finalize 平台诊断无阻断、一次提交七条 DIRECTED 关系，重试不重复、预览期间数据库不变。
- [x] STR-02：结构方向复用 StructuralLinkCatalog；草稿控制器全类回归 50/50 通过，包含原有过程方案和结构关系操作。
- [x] STR-03：RuntimeClient 对顶层/嵌套错误保留 reason_code、原状态和错误码；缺少 reason 时保留提示；助手相关回归 12/12 通过。
- [x] STR-04：统一脚本重启成功，助手/Runtime 健康和两个 LAN IP 页面均返回 200。

git diff --check 通过（换行转换提示）。未调用真实模型进行标准审查，未提交用户方案；真实模型完成情况需要原会话继续生成并审查后确认。智能助手工具权限无变更，不获得代码编辑权限。标签等其他必填字段仍由现有校验约束，不编造标签或绕过失败。
