# Checklist: OPM P03 State 直接创建与 Feature 默认收起

- Spec：`specs/opm-p03-direct-state-creation-and-default-feature-collapse-task-spec.md`
- 验收项：`DIRECT-STATE-01` 至 `DIRECT-STATE-04`、`FEATURE-COLLAPSE-01` 至 `FEATURE-COLLAPSE-02`、`DIRECT-VERIFY-01`
- 边界确认：仅修改 Spec 第 3 节允许文件；不修改 API、后端、数据库、依赖、路由、配置或发布资产。
- [x] 已确认复用现有 `CREATE_STATE` option、State 右侧检查器和 `OpdCanvas` 本地折叠状态。
- [x] Feature 默认收起与 State 直接创建完成。
- [x] State 创建候选 UI 已移除且既有 State 检查器保持不变。
- [x] Vue、Playwright、typecheck/build 与静态检查证据完成。
