# Spec: OPM DEV-07 P01/P02 Project and Model Frontend

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 目标

将 P01 项目库和 P02 项目详情从设计确认 Mock 切换到 DEV-06 Local API，实现项目查询、创建、模型查询、创建和打开工作台的真实同源主路径。

## 2. 范围与非目标

允许修改 `apps/web/src/modules/projects/**`、`apps/web/src/shared/api/**`、项目状态模块、Vite 配置、前端测试，以及为同源启动令牌新增运行时启动资源和测试。本包不修改 OpenAPI、SQLite V1、P03 画布命令/投影、完整画布 union、P04-P06 或发布打包。

## 3. 设计输入

- `docs/design/opm-development-execution-pack.md` DEV-07、6.5、8、9.1。
- `docs/design/opm-frontend-handoff.md` 7.1、7.2、12。
- `docs/design/opm-development-technology-baseline.md` 4、5、8。
- `docs/contracts/openapi/opm-local-api-v1.yaml` 的 API-PRJ-001/002/003/006/007/009。

## 4. 方案要求

1. 页面组件只调用统一的 Local API client，禁止在页面内拼接 URL 或保留项目/模型 fixture 作为运行时数据源。
2. 启动资源 `GET /opm-bootstrap.js` 仅将当前进程内 `local_session_token` 下发给同源前端；Vite 开发服务器代理该资源；不新增 OpenAPI operation 或存储令牌。
3. P01 覆盖 loading/ready/empty/error、搜索、创建项目和创建后路由 P02；P02 覆盖项目/模型 loading/ready/error、创建模型和打开 workspace。
4. 五个写 API 的前端调用自动生成 request_id/command_id、填充 Profile/Rule binding，并携带 `X-OPM-Session`；错误 envelope 映射为可恢复的页面提示。
5. P03 仍使用既有设计确认 store；P02 真实打开模型后仅以稳定 project/model 路由进入 P03，P03 的实际 bootstrap/command 联调留给 DEV-08。

## 5. 验收与验证

1. 前端单元/页面测试覆盖 P01/P02 API 成功、空、错误、创建重放与路由结果。
2. Spring MVC 测试覆盖启动资源只对 loopback 返回 JavaScript 且不写入 token。
3. 浏览器或 HTTP smoke 验证 bootstrap -> P01 create -> P02 create model -> P03 URL 的同源路径。
4. 前端 lint/typecheck/test/build、Java 21 verify、contract validate、diff check 通过。

## 6. 回滚与风险

回滚删除新增 Local API client、P01/P02 async 状态和启动资源，恢复 Mock adapter 仅用于设计确认；不涉及 OpenAPI、V1 或项目数据回滚。P03 真实投影和命令仍由 DEV-08 完成，不能把 P02 成功跳转视为完整工作台联调。
