# Task Checklist: OPM DEV-01 Contracts、Profile、Rule、Grammar 加载器

## Spec Mapping

- 当前任务规格文档：`specs/opm-dev-01-asset-loader-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`backend-springboot (primary)`、`testing`
- 目标：加载代表性 Profile 的精确 Rule/Symbol/Grammar binding，并拒绝不可信资产。
- 范围：`services/local-runtime/**`、`packages/profiles/**`、对应测试、配置和受控资产说明。
- 非目标：HTTP API、SQLite/Flyway、前端、完整 ISO 资产、设计文档与既有机器契约变更。
- 约束：Java 21、离线受控根目录、精确 `id + version + sha256`、无脚本/网络/路径穿越。
- 验收标准：成功 binding、完整失败语义、单元测试、后端 verify、既有契约校验。
- 验证方式：Java 21 Maven verify、contract validate、定向单元测试、差异与路径人工核对。
- 回滚方案：回退本包文件；不涉及数据、schema、API 或运行时写状态。

## Task 1 - 分析

- [x] 阅读当前任务规格文档
- [x] 确认 `Task Type` 为 `feature`
- [x] 阅读 `feature`、`backend-springboot` 与 `testing` 规则
- [x] 确认 DEV-01 是当前唯一开发包
- [x] 检查现有后端骨架、JSON Schema/样例和资产目录
- [x] 识别摘要占位值与默认 Java 17 风险

## Task 2 - 设计与测试准备

- [x] 定义允许和禁止修改目录
- [x] 冻结资产根、目录、精确引用与 package digest 计算方式
- [x] 定义成功、篡改、缺失、版本不符和路径穿越测试场景
- [x] 定义 Java 21 与临时 Maven 本地仓库验证命令

## Task 3 - 实现

- [x] 创建代表性只读 Profile、Rule、Symbol、Grammar 和 Normalization 资产
- [x] 实现安全路径、字节长度、SHA-256 和身份一致性校验
- [x] 返回不可变 binding summary 和明确失败语义
- [x] 配置受控默认资产根目录
- [x] 不新增 API、schema、数据库或前端改动

## Task 4 - 验证

- [x] 运行定向加载器单元测试
- [x] 运行 Java 21 `./mvnw verify`
- [x] 运行 `npm run contract:validate`
- [x] 运行 `git diff --check`
- [x] 人工核对资产边界与 `DRAFT + REPRESENTATIVE` 状态

## Task 5 - 交付

- [x] 输出 `Task Type` 与 `Active Playbooks`
- [x] 输出修改文件列表和 Acceptance Mapping
- [x] 输出验证结果
- [x] 输出事实、风险与遗留项
