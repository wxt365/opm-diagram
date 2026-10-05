# Checklist: OPM P03 Feature Owner 关系符号修正

- Spec：`specs/opm-p03-feature-owner-relation-symbol-bugfix-task-spec.md`
- 验收项：`OWNER-SYMBOL-01` 至 `OWNER-SYMBOL-06`
- 边界确认：仅修改 Spec 第 3 节允许文件；不修改 API、schema、Profile、后端、数据库、依赖或持久化语义。
- [x] 已复现逐 Feature 渲染导致三属性三关系、两操作两关系。
- [x] 已补充 fan 多成员基数、正交路由、marker、方向及装饰属性回归测试。
- [x] 已实现按 owner 与关系类型聚合的正交 fan，并保持展开收起行为。
- [x] 已完成定向与扩大验证及差异检查；Git 元数据不可用，以允许文件清单、冲突标记和尾随空格扫描替代 `git diff --check`。
