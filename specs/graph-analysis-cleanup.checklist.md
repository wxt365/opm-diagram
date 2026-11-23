# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-analysis-cleanup.spec.md`
- [x] 边界确认：仅Spec允许文件，禁止公共契约/配置/依赖变更，保留既有差异。
- [x] A1/A2/A3/A4

实际验证：完整前端76文件660/660通过；图谱24项含标签阈值、平方根尺寸、视口名额、图例颜色、选中/搜索/筛选及布局确定性回归。typecheck、五个相关文件ESLint、git diff --check通过（仅行尾提示）。未执行真实浏览器视觉验证。
清理：无效组件hops传递与watch、无用layout widths定义/消息、initialView包装、未被调用的fit暴露；render中重复edgeLabels/setLabels；标签开关仅更新标签；选择清理由display统一负责；度数computed缓存、图例Map单遍归并。父子按钮状态CSS分开作用范围避免重复覆盖。
保留：graphNeighborhood通用跳数参数仍由算法和测试使用；请求序号/身份校验、标签缓存/避让和布局位置复用均有实际用途，未删除。历史规格文档保留为变更记录。
