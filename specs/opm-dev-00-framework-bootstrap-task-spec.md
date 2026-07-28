# Spec: OPM DEV-00 前后端框架初始化

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`

## 1. 背景

`docs/` 已形成 P0 开发设计、机器契约、原型验收、前端 handoff、测试策略和执行包。执行包将 DEV-00 定义为后续开发包的唯一脚手架前置。

## 2. 目标

建立与冻结设计一致的最小可验证工程：Java 21/Spring Boot 本地运行时和 Vue 3/Vite/TypeScript strict 前端框架，以及根级契约验证和质量命令。

## 3. 非目标

- 不实现 M01-M12 业务模块、P01-P03 页面或任何领域占位数据。
- 不实现或执行 SQLite V1、Flyway migration、Profile/Rule/Grammar 加载、OpenAPI 业务接口或 X6 画布。
- 不修改现有 `docs/contracts/**`、`docs/design/**`、`prototype/**` 或 `.harness/**`；仅允许为跟踪 `package-lock.json` 在 `.gitignore` 追加例外规则。
- 不增加远程服务、认证、消息队列或安装包。

## 4. 范围

### 包含范围

- 根 `pom.xml`、Maven Wrapper 与 `services/local-runtime/**`。
- 根 `package.json`、`package-lock.json`、`.gitignore` 的锁文件例外、`scripts/validate-contracts.mjs`、`apps/web/**` 与 `tests/e2e/**`。
- 本规格和对应 checklist。

### 不包含范围

- `docs/contracts/**`、`docs/design/**`、`docs/requirements/**`、`prototype/**`、`.harness/**`。
- 生产数据库、数据迁移执行、公共 API 行为、设计文档改版和依赖升级。

## 5. 现状

- 当前没有生产前端、后端、依赖锁或 Maven Wrapper。
- `docs/design/opm-development-execution-pack.md` 已将 DEV-00 定义为仅创建结构、wrapper、lockfile、健康检查和空测试的开发包。
- 本机 Node.js 为 22.22.0；当前默认 Java 为 17.0.9，未发现 Java 21 安装。

## 6. 设计输入 / 开发前文档基线

### 顶层与模块设计

- 顶层设计：`docs/design/opm-modeling-tool-architecture.md`。
- 模块详细设计：`docs/design/opm-modeling-tool-module-design.md`。

### 页面与交互设计

- 页面或专题设计包：`docs/design/opm-modeling-workbench-page-design.md`。
- 页面信息架构与导航：`docs/design/opm-modeling-workbench-page-design.md`。
- 页面状态模型：`docs/design/opm-modeling-workbench-state-model.md`。
- 页面字段与区块明细：`docs/design/opm-modeling-workbench-field-region-detail.md`。
- 页面组件树与交互状态：`docs/design/opm-modeling-workbench-component-interaction.md`。

### 接口与原型输入

- API 草案 / 接口契约草案：`docs/design/opm-modeling-tool-application-api-contract.md`、`docs/contracts/openapi/opm-local-api-v1.yaml`。
- 原型验收基线 / 验收报告：`docs/design/opm-prototype-acceptance-report.md`。
- 前端交付标注 / 实现 handoff：`docs/design/opm-frontend-handoff.md`。
- 开发执行包 / 范围冻结文档：`docs/design/opm-development-execution-pack.md`。

### 缺口与处理

- 设计输入缺口：完整 ISO 资产、真实 Profile/Rule/Grammar、生产运行证据均未形成。
- 处理方式：它们由 DEV-01 及后续开发包承接；本任务仅提供不含业务事实的框架和契约验证入口。

## 7. 方案要求

- 后端使用 Java 21、Spring Boot 3、Maven 多模块；服务默认只绑定 `127.0.0.1`，端口使用契约默认值 `17850`。
- 前端使用 Vue 3、Vite、TypeScript strict、Vue Router、Pinia、Element Plus 和 AntV X6；开发代理仅配置 `/api/v1` 与 `/api/v1/events`。
- 根工程提供后端 verify、前端 lint/typecheck/test/build、契约验证和空 E2E 入口。
- 契约验证必须解析 OpenAPI，并用三个现有 JSON Schema 校验三个代表样例。
- 准确依赖版本由本任务的 `pom.xml` dependency management 和 `package-lock.json` 固定。

## 8. 输入输出/接口影响

### 输入

- 只读取既有 OpenAPI、JSON Schema 与代表样例。

### 输出

- 仅提供 Spring Boot Actuator 健康检查和空前端应用壳；不实现 `/api/v1` 业务操作。

### 兼容性

- 不修改已冻结 OpenAPI、Schema、SQLite V1 或原型行为。
- 新工程结构不影响现有设计资产和原型入口。

## 9. 数据与状态变化

- 不创建、执行或修改数据库 schema、迁移、数据、缓存、消息或业务状态。
- 仅新增构建依赖元数据、锁文件、框架源文件和空测试。

## 10. 风险点

- 当前缺少 Java 21，无法在本机完成 Java 21 编译和 Spring Boot 测试。
- Flyway/SQLite 精确组合、X6 符号实现和完整 Profile/Rule/Grammar 闭合均不属于 DEV-00，不能被框架绿色替代。
- 首次依赖安装依赖 npm 与 Maven 仓库可访问性。

## 11. 验收标准

### 功能验收

- 根 Maven 聚合和本地运行时模块存在，编译目标为 Java 21，默认 loopback 健康检查配置生效。
- Vue/Vite 应用可通过前端质量命令，且具备 strict、Router、Pinia、Element Plus、X6 与 API 代理基础配置。
- OpenAPI 和三个 Schema/样例可由单一根命令自动验证。
- 无业务模型、API 实现、迁移执行或虚构领域数据。

### 工程验收

- `npm run contract:validate`、`npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 和 `npm run test:e2e` 执行并记录结果。
- Java 21 可用时执行 `./mvnw verify`；若当前环境缺少 Java 21，明确报告该阻塞事实和未覆盖范围。

### 运行验收

- Java 21 环境下，启动本地运行时后，`GET /actuator/health` 可从 `127.0.0.1:17850` 访问。
- Vite 开发态只代理 `/api/v1` 与 `/api/v1/events`。

## 12. 验证方式

1. 执行前端与契约质量命令。
2. 检查锁文件、Maven Wrapper、工程目录、TypeScript strict、Vite 代理与服务绑定配置。
3. 使用当前 Java 运行 `./mvnw verify`，确认结果是否因 Java 版本门槛受阻；不将失败伪装为通过。
4. 在具备 Java 21 的环境执行后端 verify 与 loopback 健康检查。

## 13. 回滚方案

- 删除本任务新增的 `apps/`、`services/`、`scripts/`、`tests/`、`specs/`、Maven Wrapper、根构建和 Node 元数据文件即可回到当前仅设计资产状态。
- 本任务不执行 schema 或数据变更，无数据回滚动作。

## 14. 任务拆解建议

- Task 1：完成设计就绪审查并冻结 DEV-00 规格和 checklist。
- Task 2：创建前后端最小框架、根质量命令与契约验证。
- Task 3：安装依赖并执行可用验证，记录 Java 21 环境限制。
