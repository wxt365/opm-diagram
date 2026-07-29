# Task Checklist: OPM DEV-08 P03 Workbench Frontend

## Spec Mapping

- 规格：`specs/opm-dev-08-p03-workbench-frontend-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`frontend-vue (primary)`、`backend-springboot`、`testing`
- 目标：P03 五区和 Object/Process/Consumption 与既有 Local Runtime API 实际联调。
- 范围：P03 API client、独立 runtime store、工作台最小接线与前端测试；必要时仅修复 DTO 兼容。
- 非目标：OpenAPI、SQLite V1、P04-P06、State、细化、完整关系目录、依赖和全局主题。
- 约束：P0 根系统图；服务端是 revision/projection/text 的唯一事实源；viewport 不产生 revision。
- 验收标准：服务端 P03 读写闭环、错误/只读状态可恢复、自动化验证和浏览器 smoke。
- 验证方式：前端 lint/typecheck/Vitest/build、Java 21 verify、contract validate、diff check、浏览器主路径。
- 回滚方案：回退前端 P03 runtime 接线；历史服务端 revision 保留。

## 分析与测试准备

- [x] 阅读 DEV-08 执行包、P03 页面设计和 DEV-06 API 入口。
- [x] 确认当前 P03 使用设计确认 Mock store，P01/P02 已走 Local API。
- [x] 确认不修改 OpenAPI、SQLite V1、依赖和 P04-P06。
- [x] 冻结 query/command DTO、错误映射与 P0 UI 可用能力。
- [x] 建立 API/store 的成功、失败、冲突、只读回归测试。

## 实现

- [x] 扩展 Local API client 的 P03 response/request 映射。
- [x] 新增独立 P03 runtime store，处理读取竞态和恢复状态。
- [x] 将 P03 五区接到真实 projection/text/validation/revisions。
- [x] 提交 Object/Process/Consumption 并在 committed 后重读服务端数据。
- [x] 禁用本包外的 Mock-only 语义动作，保持可解释提示。

## 验证与交付

- [x] 执行前端 lint/typecheck/test/build。
- [x] 执行 Java 21 verify、contract validate、diff check。
- [x] 浏览器 smoke：隔离 Local Runtime 中创建项目/模型后进入 P03，依次提交 Object、Process、Consumption，确认 OPL、Revision、校验任务、X6 图形和移动端平移。
- [x] 更新此清单，输出 Acceptance Mapping、兼容性影响、风险与遗留项。
