# Spec: OPM DEV-03 M04/M05 核心语义与 Context

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 背景

DEV-01 已提供 Profile/Rule/Grammar 绑定摘要，DEV-02 已提供本地存储前置。执行包要求 DEV-03 在命令、持久化和文本生成之前先固定 M04/M05 的内存语义模型：Object、Process、State、Fact/Endpoint、System Diagram、Occurrence 和 Layout 必须保持稳定身份且引用闭合。

## 2. 目标

在 `local-runtime` 中实现不可变的 `SemanticRevision` 领域值、JSON contract reader 和核心不变量校验器。输入为已归一化 Revision JSON；输出为领域值与结构化校验问题，不暴露 Jackson 或 JDBC 类型。

## 3. 非目标

- 不修改 JSON Schema、Profile/Rule/Grammar、V1 SQL、OpenAPI 或前端。
- 不实现写命令、Revision 提交、幂等、SQLite Repository、事务、项目/模型 API 或 Background Task。
- 不执行完整 Capability Endpoint Schema、ISO Rule AST 或 Finding/Validation Report；这些属于 DEV-05。
- 不生成 OPL/Trace；这些属于 DEV-04。
- 不实现 Refinement Edge、View Definition、语义布局、完整 State 命令或完整画布能力；这些属于后续开发包。

## 4. 范围

### 包含范围

- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/**` 的 M04/M05 不可变值、reader、校验器与错误类型。
- `services/local-runtime/src/test/java/org/opm/localruntime/semantic/**` 的领域单元测试。
- 本规格与对应 checklist。

### 不包含范围

- `apps/web/**`、`tests/e2e/**`、`docs/design/**`、`docs/contracts/**`、`packages/**`。
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/**` 和 `assets/**` 的行为变更。

## 5. 设计输入

- 开发顺序和 DoD：`docs/design/opm-development-execution-pack.md` 第 5、6.3、7 节。
- M04/M05 职责：`docs/design/opm-modeling-tool-module-design.md` 第 5.4、5.5 节。
- 语义、Context、Layout 和跨对象不变量：`docs/design/opm-core-metamodel-field-schema.md` 第 4 至 7、11 节。
- 公共不变量：`docs/requirements/opm-common-semantic-core.md` 的 `CORE-INV-001~008`。
- 机器契约和最小 P0 fixture：`docs/contracts/schemas/opm-revision.schema.json`、`docs/contracts/examples/minimal-iso-revision.json`。
- 测试分层：`docs/design/opm-test-strategy.md` 第 3、5、6.1 节。

## 6. 方案要求

1. `SemanticRevision` 及其 Element、State、Fact、Endpoint、Context、Occurrence 和 Layout 值必须不可变；集合在构造时防御复制。
2. JSON reader 只读取冻结 Revision contract 中 DEV-03 所需字段，并在缺字段、类型不符或未知枚举时返回明确领域读取错误；不将 `JsonNode` 泄漏到领域 API。
3. 校验器必须覆盖：稳定 ID 全局唯一、Model/Profile Capability 绑定一致、State owner 与 Element 的双向引用、Fact endpoint/ordinal/target/state qualification、root Context、Occurrence 与 Context 双向闭合、Occurrence target/Layout 引用和几何布局有效性。
4. 校验问题提供稳定 code 与定位 ID；调用者可区分 `DUPLICATE_ID`、`MISSING_REFERENCE`、`CAPABILITY_BINDING_MISMATCH`、`INVALID_ENDPOINT`、`STATE_OWNER_MISMATCH`、`CONTEXT_CLOSURE_VIOLATION`、`INVALID_LAYOUT`。
5. `VIEW_DERIVED` Occurrence 不能作为 Fact 的 owner。普通几何 Layout 仅属于 Context 投影，不进入 Fact/Element 值。
6. Capability 的完整类型/端点/组合规则只由后续 Profile/Rule 执行器判断；本包仅验证 CapabilityRef 与固定 Model Profile 的 ID、版本一致。

## 7. 接口与状态影响

- 不新增 HTTP/OpenAPI、数据库 schema、Flyway migration 或应用配置。
- 新增进程内 Java 领域 API；它不进行文件写入、数据库访问或网络访问。
- 领域 reader 读取 caller 提供的 `Path` 或 `InputStream`，不访问默认工作区，也不自动加载 Profile 包。

## 8. 验收标准

1. `minimal-iso-revision.json` 能读取为 Object、Process、State、Consumption Fact 和 System Diagram Context，且所有校验问题为空。
2. 同一 semantic entity 跨 Context 通过多个 Occurrence 引用，不产生复制 Element/Fact。
3. 缺失目标、重复 StableId、错误 Capability binding、State owner mismatch、Endpoint 非连续 ordinal/悬空 target、Context 双向引用不闭合、悬空 Layout 和非法尺寸均有稳定失败测试。
4. 领域类型不暴露 `JsonNode`、`ObjectMapper`、`Connection`、`ResultSet` 或可变集合。
5. Java 21 定向领域测试、根级 `verify`、既有 `contract:validate` 和差异检查通过。

## 9. 验证与回滚

单元测试直接读取版本库内的冻结 fixture，不复制为第二份测试样例。每个负例在内存中基于已读取领域值替换一个字段，避免污染合同资产。

本包没有持久化或 API 发布。回滚仅删除新增 `semantic` 源码和测试；不影响已有 Revision、数据库或前端状态。

## 10. 风险

- 代表性 Profile/Rule 仅提供少量能力和规则，不可作为 96 Capability/103 Rule 的执行证据；完整执行明确留给 DEV-05。
- JSON reader 不是 JSON Schema validator；静态 Schema 校验继续由既有 `contract:validate` 负责。
- Refinement、View、语义布局和完整 State/Fact 命令没有在本包实现，后续模块应复用本包的稳定身份与引用校验结果。
