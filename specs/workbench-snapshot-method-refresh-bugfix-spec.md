# 快照模式摘要刷新隔离修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。repo-profile/Task Type/playbook 文件缺失，遵循仓库硬规则。

## Spec

目标：纯快照模式打开/刷新架构方法面板、切图、替换快照时不调用服务；自动刷新遵守提交中保护；保持跨图恢复高亮。
非目标：密集图性能、裁剪和其他接口/业务行为。
允许：apps/web/src/stores/workbenchRuntime.ts 的摘要刷新保护，apps/web/src/workbench/OpmWorkbench.spec.ts、apps/web/src/modules/workbench/WorkbenchMethodPanel.spec.ts，必要的工作台组件浏览器回归，本 Spec/Checklist；按 AGENTS.md 第 7 条在既有 agent-failures.md 记录此次漏验回流。禁止：API、schema、依赖、配置、持久化、其他 .harness 文件及无关文件。契约不变。

验收：
- AC1：无服务及带宿主服务的快照，打开面板、手动刷新、收起重开、导航、替换快照后零摘要/网络请求，无误导性接口错误。
- AC2：Runtime 提交中不发自动摘要查询；正常就绪刷新可用；跨图定位恢复高亮且普通导航/输入变更清理过期定位。
- AC3：先定向测试，再完整前端单元、lint、类型/构建及真实 Runtime 定向验收，记录实际结果和未覆盖场景。

验证：Vitest 真实嵌入组件与假服务调用计数；Playwright 本机 Chrome + 独立临时 Runtime。回滚仅本次保护和测试差异，保留此前未提交变更。

## Plan

1. 补嵌入组件隔离用例及提交中用例，确认旧实现失败。
2. 自动刷新恢复快照/提交中保护，保留已修复的定位刷新顺序。
3. 验证隔离与 Runtime 行为，更新 Checklist。

## 实现

只为自动 watcher 恢复 `!snapshotData` 与 `commandState !== submitting` 条件，继续直接刷新 loader，避免再次清除跨图刚恢复的高亮。显式刷新入口、其他请求与语义命令保持原逻辑。
