# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/workbench-snapshot-method-refresh-bugfix-spec.md

边界确认：仅 Spec 允许范围；API/schema/依赖/配置/持久化禁改；.harness 仅按 AGENTS.md 第 7 条记录既有 Failure 文件，保留已有变更。

- [x] AC1
- [x] AC2
- [x] AC3

实际验证（2026-11-12）：
- 修复前新增三条测试均失败，证实捕获快照误调服务与提交中误查询；修复后 16 条定向用例通过。
- npm test：80 个文件、782 条用例全部通过。日志：系统临时目录 opm-snapshot-refresh-unit.log。
- 生产构建、工作台组件构建（含类型检查）、契约校验、lint、git diff --check 通过。既有 Bootstrap/chunk size 构建提示保留。
- Chrome 构建包组件 5 条通过，包含快照方法面板打开、刷新、重开零 API 请求及无页面错误；原状态布局、长文本、拖动和多实例回归通过。
- Chrome Runtime 5 条通过：保存/历史返回与真实按钮命中、状态关系层级、分类跨图及方法证据高亮、重叠裁剪。日志：opm-snapshot-refresh-runtime-e2e.log。
- Chrome IP/端口直连 1 条通过：首次关联、编辑保存、再次关联及 binding 打开。
- 只使用本轮临时 Runtime 数据，未访问原业务项目；未重跑后端、PG、真实 LLM、完整浏览器矩阵和极端密集性能。此前密集长任务未由本次解决。
