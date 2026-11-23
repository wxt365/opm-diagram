# OPD 过程关系名称菜单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。repo-profile/task-types 文件不存在，遵循 AGENTS.md。

目标：画布空白右键统一显示/隐藏全部过程关系中文类型名称，默认隐藏；沿用符号和时长注释。非目标：不修改语义关系名称或持久化显示偏好。
边界：允许 CanvasContextMenu.vue 及测试、WorkbenchSurface.vue、OpdCanvas.vue、opd/core/canvas-scene.ts、新增 opd/core/procedural-labels.ts 及测试、本任务 specs 文档；禁止 API/schema/配置/依赖/后端和其他文件。仅工作台内存状态，无公共契约变化。保留已有改动。
验收：A1 画布菜单可统一切换全部过程关系名称，结构关系标签不受影响；A2 名称只添加一次、影响关系只在主线显示且保留原注释；A3 重绘保持，关闭恢复，默认隐藏；A4 定向测试、类型检查、ESLint 通过。
Plan：在 scene 构建后、路由前追加可选名称；复用画布空白右键菜单统一开关；验证纯渲染转换及既有画布回归。
验证：组件/核心定向测试、typecheck、ESLint；无浏览器验证则明确限制。回滚仅撤销本任务差异。
