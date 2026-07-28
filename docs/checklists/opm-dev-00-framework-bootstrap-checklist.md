# Task Checklist: OPM DEV-00 前后端框架初始化

## Spec Mapping

- 当前任务规格文档：`specs/opm-dev-00-framework-bootstrap-task-spec.md`
- `Task Type`：`feature`
- 开发前设计输入：架构、模块设计、页面设计/状态/字段/组件交互、OpenAPI、原型验收、handoff、执行包和测试策略均位于 `docs/`；完整 ISO 资产与生产证据不在本任务范围。
- 目标：建立 DEV-00 的最小、可验证前后端工程。
- 范围：根构建配置、`apps/web/**`、`services/local-runtime/**`、契约验证、空测试、任务文档，以及 `.gitignore` 中的 `package-lock.json` 例外规则。
- 非目标：业务模块、API 实现、SQLite/Flyway 执行、设计资产修改和远程服务。
- 约束：Java 21、Node 22、loopback、无领域占位数据、前端只代理约定路径。
- 验收标准：前后端质量入口、契约验证、锁文件、Wrapper、空健康检查和无业务实现。
- 验证方式：前端质量命令、契约验证、目录/配置人工检查、后端 verify 尝试。
- 回滚方案：删除本任务全部新增工程文件；无数据或 schema 回滚。

## Task 1 - 分析

- [x] 阅读当前任务规格文档
- [x] 确认 `Task Type`
- [x] 阅读 `.harness/task-types/feature.md`
- [x] 确认 DEV-00 是唯一开发包
- [x] 确认允许修改范围
- [x] 确认当前无生产工程可复用
- [x] 识别 Java 21 环境风险

## Task 2 - 设计输入检查

- [x] 确认架构与模块设计已定位
- [x] 确认页面、状态、字段和组件交互设计已定位
- [x] 确认 OpenAPI、原型验收、handoff、执行包和测试策略已定位
- [x] 记录完整 ISO 资产与生产运行证据不阻断 DEV-00

## Task 3 - 测试准备

- [x] 定义前端、契约、后端和 E2E 验证命令
- [x] 创建无业务事实的最小测试
- [x] 执行前端和契约验证
- [x] 尝试后端验证并记录 Java 21 环境阻塞

## Task 4 - 实现

- [x] 创建根构建、Maven Wrapper 与 Spring Boot 本地运行时
- [x] 创建 Vue/Vite/TypeScript strict 前端基础工程
- [x] 创建根契约验证与质量命令
- [x] 控制在规格允许目录内
- [x] 确认未引入业务、schema 或公共 API 改动

## Task 5 - 验证

- [x] contract validate 通过
- [x] lint 通过
- [x] typecheck 通过
- [x] 前端 unit/build/E2E 空入口通过
- [x] 后端 verify 已执行，且因 Java 21 缺失明确阻断
- [x] 手工检查 loopback、代理、目录和无业务范围

## Task 6 - 交付

- [x] 输出 `Task Type`
- [x] 输出 `Active Playbooks`
- [x] 输出修改文件列表
- [x] 输出验证结果
- [x] 输出风险和遗留项
- [x] 区分事实和假设
