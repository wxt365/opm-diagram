# Task Checklist: OPM DEV-07 P01/P02 Project and Model Frontend

## Spec Mapping

- 规格：`specs/opm-dev-07-project-model-frontend-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`frontend-vue (primary)`、`backend-springboot`、`testing`
- 目标：P01/P02 使用 DEV-06 Local API 的项目/模型主路径。
- 范围：前端 API adapter、P01/P02 状态、启动令牌资源、测试。
- 非目标：OpenAPI/V1/P03 实际画布命令、P04-P06、完整画布与发布打包。
- 验收：页面状态、创建/打开路由、同源令牌、前后端验证。
- 回滚：删除 DEV-07 新增 adapter/启动资源/页面 async 状态；不回滚数据或契约。

## 分析

- [x] 确认 P01/P02 当前运行时直接读取 Mock fixture
- [x] 确认 DEV-06 已提供 6 个项目/模型 operationId
- [x] 确认写令牌下发缺少启动资源，不能新增未编号 token API

## 实现与测试

- [x] 实现同源启动令牌资源与 Vite 代理
- [x] 实现 Local API client、DTO 到 P01/P02 ViewModel 映射与错误映射
- [x] 切换 P01/P02 的 query/create/open 状态，保留 P03 为 DEV-08 范围
- [x] 覆盖启动资源、P01/P02 成功/空/错误/路由与请求头

## 验证与交付

- [x] 执行前端 lint/typecheck/test/build、Java verify、contract validate、diff check
- [x] 人工核对本包未修改 OpenAPI/V1/P03 真实编辑范围
- [x] 输出 Acceptance Mapping、兼容性影响、文件、验证与风险
