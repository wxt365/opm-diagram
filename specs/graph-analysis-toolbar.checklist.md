# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: `specs/graph-analysis-toolbar.spec.md`
- [x] 边界确认：只改 Spec 允许文件；API/schema/配置/依赖禁止；保留已有差异。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

实际验证：图谱画布与面板测试 12/12 通过；前端 typecheck 通过；Panel.vue 与 Panel.spec.ts 定向 ESLint 通过；git diff --check 通过（仅行尾转换提示）。
已有 e2e 改为通过范围切换触发查询；未运行真实浏览器 e2e，当前服务未启动。
手工复核：打开图谱，检查左侧节点类型下的显示标签开关；确认无邻域选择，选中节点后仅直接关联节点高亮；确认顶部无刷新按钮，修改模型后在过期提示点击更新结果可恢复定位。

本轮追加 Plan：L1 / bugfix / none (primary)；复用 Spec A2 及已确认边界，仅修改面板和对应测试、任务记录；固定传入深度 1，移除无用状态；执行图谱定向测试与类型检查。回滚仅撤销本轮差异。

本轮实际验证：图谱画布及面板测试 12/12 通过；前端 typecheck 通过；git diff --check 通过（仅行尾提示）。未运行浏览器联调。
