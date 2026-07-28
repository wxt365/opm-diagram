# Task Checklist: OPM P0 前端动态交互确认

## Spec Mapping

- 当前任务规格文档：`specs/opm-p0-frontend-interaction-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`frontend-vue (primary)`、`testing`
- 目标：完成 P01-P03 P0 设计确认动态交互。
- 范围：`apps/web/src/**`、任务规格和本 checklist。
- 非目标：真实 API/SQLite/领域提交及 P04-P06。
- 约束：mock 隔离、只读守卫、viewport 与语义操作分离、稳定测试标识。
- 验收与验证：规格第 7 节；前端自动化和浏览器桌面/移动验证。
- 回滚：规格第 8 节，无数据回滚。

## Task 1 - 设计与边界

- [x] 阅读 handoff、页面、状态、字段、组件交互和原型输入
- [x] 确认 P01-P03 与 6 个 P0 弹层为本轮范围
- [x] 确认真实 API/SQLite/P04-P06 不在本轮范围
- [x] 确认 JDP Vue3 的结构、框架、列表、弹层和 tabs 规则

## Task 2 - 实现

- [x] 建立模块化路由、应用壳与 mock 适配边界
- [x] 实现 P01/P02 项目和模型动态主路径
- [x] 实现 P03 五区、选择联动和画布候选交互
- [x] 实现 P0 弹层、校验、语义缩放、只读基线和建草稿守卫
- [x] 补充单元和页面交互测试

## Task 3 - 验证与交付

- [x] lint、typecheck、unit、build 通过
- [x] 浏览器执行 P01 -> P02 -> P03 主路径
- [x] 浏览器验证视口/语义缩放、基线只读、移动无全局横向溢出
- [x] 输出修改文件、验证、风险与事实/假设
