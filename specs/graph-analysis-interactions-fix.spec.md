# 图谱画布交互修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。
仓库未提供 `.harness/repo-profile.md` 和 `.harness/task-types/bugfix.md`，按 AGENTS.md 与相关实现执行。

## 目标与非目标
修复节点选中/搜索描边被覆盖、关闭标签后悬停仍显示、密集图选中关系标签缺失三项问题。不改变图谱投影、布局算法或后端行为。

## 边界与契约
允许修改 `apps/web/src/modules/workbench/GraphAnalysisCanvas.vue`、同目录新增画布回归测试，以及 `specs/graph-analysis-interactions-fix*` 文档。允许相关测试和任务文档；禁止修改其他目录、公共 API、schema、配置、依赖及无关实现。不改变公共契约。

## 验收
- A1：选中和搜索节点描边保持突出，缩放和悬停不覆盖，取消后恢复普通描边。
- A2：关闭标签后，关系悬停和选择都不显示标签；重新开启恢复。
- A3：边数达到 180 时，选中关系显示标签，移出仍保留；取消选择隐藏，未选中关系仍支持临时悬停标签。
- A4：已有图谱测试与前端类型/定向静态检查通过。

## 验证与回滚
挂载真实 Vue 画布组件，模拟 X6、Worker 和 ResizeObserver，验证真实事件与属性更新路径；运行已有面板测试及前端 typecheck、定向 ESLint。未运行真实浏览器时明确说明限制。
回滚仅撤销本任务画布差异及新增测试、任务文档。

## Plan
1. 复用画布现有标签更新入口，集中处理关系标签可见性；缩放更新统一计算节点描边。
2. 新增组件回归测试，先确认旧代码失败，再修改实现。
3. 执行定向测试、类型检查和静态检查，记录实际结果。
