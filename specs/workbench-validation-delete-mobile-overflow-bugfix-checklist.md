# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/workbench-validation-delete-mobile-overflow-bugfix-spec.md

边界确认：按 Spec，仅前端相关实现/样式/测试；后端/API/schema/依赖/配置/持久化/.harness 禁改。

- [x] AC1
- [x] AC2
- [x] AC3

实际验证（2026-11-12）：
- 原窄屏探针连续切换复现页面394px，越界为 navigator-resizer 4px；修复仅 scoped 媒体规则。
- 校验删除真实命中路径、关系操作、删除、重校验阻断0、保存刷新、历史只读原用例完整通过。
- 浏览器4条×3轮=12条全部通过：普通右键/Backspace删除、校验删除完整闭环、手动/自动保存与精确版本/返回HEAD、390px新用例。窄屏每轮12次即时视口切换（无poll掩盖竞态），长模型名、保存/历史返回/刷新及恢复桌面拖拽条均通过。日志：系统临时目录 opm-delete-mobile-regression.log。
- 全量前端80文件/782用例、lint、契约、TypeScript/生产构建、git diff --check通过。日志：opm-delete-mobile-unit.log。
- 独立临时 Runtime，不改业务数据。未复跑后端（无生产后端改动）、真实LLM、PG及多浏览器矩阵；本次不处理既有密集性能/JSON迁移问题。
