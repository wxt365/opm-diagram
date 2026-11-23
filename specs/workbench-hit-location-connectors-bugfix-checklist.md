# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/workbench-hit-location-connectors-bugfix-spec.md

边界确认：仅 Spec 允许目录；API/schema/依赖/配置/业务数据/.harness 禁改。

- [x] AC1
- [x] AC2
- [x] AC3
- [x] AC4
- [x] AC5
- [x] AC6（完成评估与受控优化；极端密集长任务未解决，见 Spec 限制）

验证证据（2026-11-12）：
- npm test：80 文件 / 779 用例通过，含跨图 loading→ready 后自动摘要刷新保留高亮、普通导航清理回归。
- 定向 Runtime Playwright：自动布局保存/历史返回后真实点击折叠、状态关系层级、分类及方法证据跨图定位共 4 条通过。日志：系统临时目录 opm-three-fixes-regression-final.log。
- 密集 Playwright：1000 个基础节点 / 2000 条关系增量加入状态和特征；全部 500 默认连接器及 500 终态内框存在，改名、删除、无关实例保留通过。日志：opm-three-fixes-dense-final.log。
- 100/500/1000/3000 基础节点性能用例均通过既有阈值；日志 opm-three-fixes-performance-final.log 中密集场景首次增强断言发现终态内框延迟，修复后以上独立密集回归通过。
- lint、TypeScript/生产 build、契约校验、git diff --check 通过。构建保留既有 Bootstrap script 和 chunk size 提示。
- 本次仅前端变更，未复跑后端测试、真实 LLM、PG 或跨浏览器矩阵。

补充修复验证：
- 原生 Chrome 命中与 Path2D 几何校验：完全重合、部分重合、三圆相交、相切、环形孔洞、移动/缩放后裁剪一致；外部连线仍可命中。
- 最终 Runtime 5 条、密集场景 1 条通过；779 条前端单元通过，lint/类型检查/契约/build 通过。日志：系统临时目录 opm-impact-runtime-final.log、opm-impact-dense-final.log、opm-impact-unit-final.log。
- 密集真实增量完成 83330ms，最大 Long Task 79705ms。仅减少不必要裁剪，不宣称性能风险消除。原始数量和超时断言未放宽。
