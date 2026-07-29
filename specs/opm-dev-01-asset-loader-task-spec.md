# Spec: OPM DEV-01 Contracts、Profile、Rule、Grammar 加载器

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 背景

`DEV-00` 仅提供了本地运行时壳。开发执行包将 `DEV-01` 定义为后续语义、文本和命令模块的前置：Profile、Rule、Grammar 与 Symbol 必须以精确版本和摘要离线加载，不能由页面 Mock、当前最新版本或任意文件路径替代。

现有 `docs/contracts/examples` 是 JSON Schema 代表样例，其中资产摘要为设计占位值，不能直接作为摘要校验输入。

## 2. 目标

建立代表性 ISO 草案 Profile 的只读离线资产包和本地加载器。加载器返回固定 Profile/Rule/Symbol/Grammar binding 摘要，并在版本、摘要、清单、文件路径或依赖一致性不满足时明确拒绝。

## 3. 非目标

- 不实现 M02-M12 业务模块、HTTP API、前端对接或 X6 投影。
- 不执行 SQLite/Flyway、修改 SQL schema 或创建运行时数据。
- 不将代表性资产升级为完整 ISO Profile、103 Rule Group、511 原子规则或 Annex A Grammar。
- 不修改既有 OpenAPI、JSON Schema、设计文档或 Mock 前端行为。
- 不加载网络资源、脚本、任意绝对路径或路径穿越条目。

## 4. 范围

### 包含范围

- `services/local-runtime/src/main/java/**` 的资产领域值对象和离线加载器。
- `services/local-runtime/src/test/java/**` 的加载成功和失败回归测试。
- `services/local-runtime/src/main/resources/application.yml` 的只读资产根目录配置。
- 新增 `packages/profiles/**` 下的代表性 Profile、Rule、Symbol、Grammar 和 Normalization 资产。
- 本规格、对应 checklist，以及 `docs/contracts/README.md` 的受控资产布局说明。

### 不包含范围

- `apps/web/**`、`tests/e2e/**`、`docs/design/**`、`docs/contracts/schemas/**`、`docs/contracts/openapi/**`、`docs/contracts/migrations/**`。
- 数据库 schema、公共 HTTP API、依赖升级和远程服务配置。

## 5. 现状

- `services/local-runtime` 仅包含 Spring Boot 启动类和空上下文测试。
- 根工程已固定 Java 21，但默认终端 Java 是 17；本机另有 Java 21 安装。
- `packages/profiles`、`packages/rules`、`packages/grammar` 和受控加载实现尚不存在。
- Profile/Rule 的 JSON Schema 与代表样例存在，但样例中的摘要为占位值。

## 6. 设计输入 / 开发前文档基线

不启用 `design-module-docs`。本任务不补充或修改模块/页面设计，直接实现已冻结执行包的单一技术前置。

- 架构与模块边界：`docs/design/opm-development-technology-baseline.md`、`docs/design/opm-modeling-tool-module-design.md`。
- Profile/Rule 逻辑字段：`docs/design/opm-profile-package-field-schema.md`、`docs/design/opm-rule-definition-field-schema.md`。
- Symbol/Grammar 绑定：`docs/design/opm-symbol-and-text-generation-implementation-contract.md`。
- 机器契约样例：`docs/contracts/schemas/*.json`、`docs/contracts/examples/*.json`。
- 范围冻结与完成定义：`docs/design/opm-development-execution-pack.md` 第 5、6.2 节。
- 测试基线：`docs/design/opm-test-strategy.md` 第 3、5、10 节。

缺口：完整 ISO 资产和正式 Conformance Suite 未就绪。本包只发布 `DRAFT + REPRESENTATIVE` 资产；加载成功不构成 ISO 符合性或 P0 业务闭环证据。

## 7. 方案要求

1. 资产根目录在 `opm.assets.root` 配置，默认指向仓库内 `packages/profiles`；加载器只接受该根目录下的逻辑相对路径。
2. Profile 目录固定为 `<profile-id>/<package-version>/`，根文件为 `profile.json`。
3. 每个 required manifest entry 校验安全相对路径、实际字节长度、SHA-256 和 `id + version`；Profile 的 required Rule/Symbol/Grammar 依赖还必须与其顶层引用一致。
4. `package_digest` 定义为 manifest entries 按 `logical_path` 升序的 `logical_path + '\\n' + byte_length + '\\n' + digest + '\\n'` UTF-8 串的 SHA-256；不含自身字段，避免自引用。该定义仅适用于本代表性 DEV-01 资产格式。
5. 资产文件是 JSON 数据，不执行脚本、不发起网络请求。加载器不解释 Rule AST、Symbol 几何或 Grammar 产生式，只校验与返回其固定 binding。
6. 领域加载器不依赖 Spring 容器，使用 JUnit 5 纯单元测试；Spring 配置仅提供未来装配入口。

## 8. 输入输出/接口影响

### 输入

- 本地 Profile ID、package version、expected package digest。
- 受控资产根目录中的 `profile.json` 和 manifest 指定文件。

### 输出

- 只读 `ProfileBindingSummary`：Profile、Rule Set、Symbol Catalog、Grammar 的 ID、版本和 SHA-256。
- 结构化 `AssetLoadException`，描述配置错误、缺文件、摘要不一致、依赖不一致或不安全路径。

### 兼容性

- 不增加或变更 HTTP API、OpenAPI、前端 DTO、数据库 schema。
- 不影响现有 Mock adapter；后续模块只能显式接入加载器，不能将它当作自动业务初始化。

## 9. 数据与状态变化

- 新增只读版本化资产文件和应用配置。
- 不创建数据库、缓存、消息、Revision 或运行时写状态。

## 10. 风险点

- 摘要和长度手工更新易出错，必须由测试验证真实包。
- Maven Wrapper 默认写入用户 Maven 目录；验证时需使用项目外可写的临时本地仓库。
- 当前代表性资产的覆盖范围有限，错误地启用完整画布能力会越过本包边界。

## 11. 验收标准

### 功能验收

- 代表性 Profile 可返回固定 Rule/Symbol/Grammar binding 摘要。
- 缺 required 文件、摘要篡改、版本不一致、不安全 logical path 和不同 expected digest 都被拒绝。
- 加载器不接受绝对路径、`..` 路径和网络资源。

### 工程验收

- 所有代表性 Profile/Rule JSON 继续通过既有 `npm run contract:validate`。
- 加载器纯单元测试通过；Java 21 下 `./mvnw verify` 通过。
- 不新增业务 API、数据库 schema 或前端改动。

### 运行验收

- 在 Java 21 环境以项目外临时 Maven 仓库执行后端验证。
- 人工核对资产仅位于受控根目录，且 `DRAFT + REPRESENTATIVE` 状态不被展示为 ISO 符合。

## 12. 验证方式

1. 使用 Java 21 执行 `./mvnw -Dmaven.repo.local=/private/tmp/opm-diagram-m2 verify`。
2. 执行 `npm run contract:validate`，验证既有三份 schema/样例。
3. 执行加载器单元测试，覆盖成功、篡改、缺文件、版本不匹配和路径穿越。
4. 检查 `git diff --check`，并人工核对新增文件未越出本规格范围。

## 13. 回滚方案

- 回退本包新增的 `packages/profiles/**`、加载器、测试和配置即可恢复 DEV-00 壳。
- 本包不写数据库、不创建 Revision、不开启 HTTP 路由，无数据回滚或兼容窗口。

## 14. 任务拆解建议

- Task 1：核对设计输入、现有契约和 Java 21 环境。
- Task 2：建立版本化代表性资产与 manifest 摘要。
- Task 3：实现只读加载器、binding summary 和失败语义。
- Task 4：补充成功与失败单元测试。
- Task 5：运行后端、契约和差异验证。
