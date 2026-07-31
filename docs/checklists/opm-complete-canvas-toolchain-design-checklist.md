# Task Checklist: OPM 完整画布工具链设计补齐

## Spec Mapping

- 当前任务规格：`specs/opm-complete-canvas-toolchain-design-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`design-module-docs (primary)`、`testing`
- 目标：补齐 State、完整关系族、图标化工具链、符号/OPL 契约和后续开发包。
- 范围：规格第 4.1 节列出的设计、handoff、执行包、索引和本 checklist。
- 非目标：代码、原型、OpenAPI、Schema、数据库和 ISO 符合性声明。
- 约束：Profile 动态过滤、端点归一化、版本绑定、语义命令与 viewport 隔离。
- 验收：规格第 7 节。
- 验证：链接、Capability 覆盖、术语一致性、Markdown 格式和 `git diff --check`。
- 回滚：回退本任务文档，不涉及数据或运行时回滚。

## Task 1 - 边界与输入

- [x] 核对需求、Capability、ISO 条款、元模型、页面、符号、handoff 和执行包
- [x] 确认当前缺口是“需求已定义、完整实现设计未冻结、P0 范围主动缩减”
- [x] 冻结只改文档，不改代码/API/schema/原型

## Task 2 - 专题设计

- [x] 补齐工具栏组件树、工具分组、图标、字段和状态
- [x] 补齐 State 创建、展示、编辑、修饰和语义抽象闭环
- [x] 补齐关系候选、端点过滤、预览、提交、失败和回流
- [x] 补齐键盘、可访问性、响应式和大图交互口径

## Task 3 - 符号与文本契约

- [x] 覆盖 16 类 Procedural Link
- [x] 覆盖 8 类 Control Link 组合
- [x] 覆盖 10 类 Structural Link
- [x] 冻结 marker、line、label slot、route 和 template family
- [x] 补齐逐关系 golden、组件、契约、视觉和 E2E 验收映射

## Task 4 - Handoff 与执行包

- [x] 更新 frontend handoff 的完整画布输入和实现边界
- [x] 将后续能力拆为有依赖顺序的开发包
- [x] 明确每个开发包的 DoD、自动化层级、风险与回滚
- [x] 更新文档索引、状态和建议阅读顺序

## Task 5 - Verify

- [x] 新增及修改文档的相对链接有效
- [x] 16/8/10 Capability 覆盖无遗漏、无重复
- [x] State、Aggregation-participation、Generalization-specialization 等术语一致
- [x] 文档不把设计、fixture 或命令成功冒充 ISO/运行证据
- [x] `git diff --check` 通过

## Round 1 Verify Record

1. 7 份本任务文档的 Markdown 相对链接检查通过。
2. 专题设计与符号契约均为 Procedural `16/16`、Control `8/8`、Structural `10/10`。
3. State 和十类关键英文关系术语存在性检查通过。
4. Markdown 表格列数检查和 7 份文档尾随空白检查通过。
5. `git diff --check` 通过；Round 1 当时这些文档均为未跟踪文件，因此同时使用独立逐行检查覆盖其内容。
6. 本任务只修改设计文档，无需运行代码测试、构建或浏览器 E2E；这些证据由 DEV-CANVAS-00~06 承接。

## Task 6 - Canonical 文档闭环

- [x] 应用 API 冻结结构化 Capability Query/Option 和 State/Fact command union
- [x] Profile 字段级 Schema 冻结 Relation Symbol/Marker Descriptor
- [x] 页面状态模型增加 State 选择、State candidate 和 relation candidate 正交切片
- [x] 页面字段文档增加工具链候选、State 检查器、完整 Relation 检查器字段
- [x] 页面组件文档同步完整工具链组件树、事件、状态和稳定测试入口
- [x] 测试策略承接 State、16/8/10、golden、视觉、E2E 和性能门槛

## Task 7 - Round 2 Verify

- [x] 13 份本任务文档的相对链接有效
- [x] 16/8/10 Capability 在需求、专题、符号、验收和测试入口一致
- [x] `CREATE_STATE/UPDATE_STATE/CREATE_FACT/UPDATE_FACT` 在 API、handoff、执行包一致
- [x] State 不是 Element，选择、字段、组件和命令不再混用
- [x] P0 机器契约与完整画布待实现边界一致
- [x] Markdown 表格、尾随空白和 `git diff --check` 通过

## Round 2 Verify Record

1. 13 份任务文档的 Markdown 相对链接、表格列数和尾随空白检查通过。
2. 能力矩阵、需求验收矩阵、完整画布专题设计和符号契约均达到 Procedural `16/16`、Control `8/8`、Structural `10/10`。
3. `CommandCapabilityQuery/Option`、`CREATE_STATE/UPDATE_STATE/CREATE_FACT/UPDATE_FACT`、删除 impact summary/token 在应用 API、专题、handoff、执行包和测试策略中一致。
4. 页面状态、字段和组件均使用独立 State selection/candidate；State 不进入 `CREATE_ELEMENT` 或 Element ID/组件。
5. 文档一致声明：P0 OpenAPI/代表性 Schema 已存在，完整画布逻辑设计已冻结，机器契约、完整资产和生产证据由 DEV-CANVAS-00~06 实现。
6. `git diff --check` 通过；本任务仅修改设计文档，未运行代码构建、单元测试或浏览器 E2E。

## Task 8 - Control Fact 持久化闭环

- [x] 核心元模型冻结基础 Fact + 两个受控 Modifier 表示及 `condition_id` 边界
- [x] 应用 API 冻结 Control modifier wire payload、值域、基数和原子更新规则
- [x] Profile Schema 冻结两个 ModifierSchema 与 8 类 Control Capability 映射
- [x] 逻辑/物理持久化文档明确 Revision JSON 归属、SQLite 无 DDL 变更和索引策略
- [x] 符号、OPL/Trace、执行包和测试策略同步 Control 表示
- [x] 验证文档一致性并明确 Revision JSON Schema 仍待机器契约任务补齐

## Round 3 Verify Record

1. Control 在基础 Procedural Fact 上统一为 `control.capability/control.segment` 两项受控 Modifier；两项各唯一、成对原子新增/替换/删除，基础 `fact_id/fact_family/capability_ref/endpoints` 不变。
2. `control.capability` 值域为 `CAP-ISO-CTRL-001~008`，`control.segment` 当前唯一值为 `PROCESS_INPUT`；独立 `condition_id/MS-COND-001` 不重复表达 Event/Condition 类型。
3. Candidate、command、Profile ModifierSchema、Revision JSON、X6、OPL/Trace、Rule、digest 和前端 handoff 使用同一 pair；Control Capability 与基础 Fact Capability 已分字段承接。
4. SQLite V1 不新增表、列、索引或 Flyway migration；`fact_endpoint_index` 不成为第二事实源。
5. 当前机器 `opm-revision.schema.json` 仍为 0.1 身份且已出现 Fact `modifiers[]`；独立 0.2 Schema、reader/writer、roundtrip 和运行证据由 DEV-CANVAS-00/03 承接。
6. 当前 OpenAPI 已有 State/Fact union、结构化 option、`base_fact_capability_ref` 和 Modifier 基数/原子组；0.2 发布、generated DTO/handler 和正反 contract test 仍不计为本轮设计完成证据。
7. 本任务 14 份文档的相对链接、Markdown 表格列数、尾随空白和限定路径 `git diff --check` 均通过；文档任务未运行代码构建、单元测试或浏览器 E2E。

## Task 9 - Concrete OPL、Precedence 与 Trace 冻结

- [x] 8 类 Control 展开为 20 个允许基础 Fact concrete template
- [x] Control 保持基础 Fact 身份和一个合成 SentencePlan，禁止独立 Control Fact/附加句
- [x] 10 类 Structural 冻结单向、双向、互惠、fan/list/completeness 和 State-specified 句式
- [x] 纠正不存在的 Clause 15，分离 `14.2.4.1.4`、`A.3.1` 和产品确定性句序
- [x] 冻结 UTF-8 byte Token range、全 byte 覆盖和 Sentence Trace 依赖闭包
- [x] 冻结主 ID + 语义 variant suffix 的 golden manifest、PASS/BLOCKED 和 replay SHA-256

## Task 10 - DEV-CANVAS-05/06 直接开发输入

- [x] 新增 DEV-CANVAS-05 独立 task spec/checklist，冻结范围、非目标、DoD、兼容与回滚
- [x] 新增 DEV-CANVAS-06 独立 task spec/checklist，冻结工具链、视觉、E2E、性能和发布边界
- [x] 冻结普通反馈 `100 ms`、增量 OPL `500 ms`、300/600 与 1,000/2,000 交互阈值
- [x] 冻结 10,000 结点保存/快照/全量校验 `10/15/60 s` 和零失败口径
- [x] 同步产品 NFR、验收矩阵、测试策略、执行包、专题设计和文档索引

## Task 11 - Round 4 Verify

- [x] 本轮文档相对链接有效
- [x] Markdown 表格列数和尾随空白检查通过
- [x] 仓库内不再把 `Clause 15` 当作 ISO 来源；保留的字样只用于明确“该条款不存在”
- [x] Control concrete PASS 组合恰为 20 个且 Capability/base Fact 映射无缺漏
- [x] DEV-CANVAS-05/06 的范围、非目标、阈值、DoD 和回滚在规格/执行包/测试策略一致
- [x] 限定文件 `git diff --check` 通过
- [x] 记录文档任务无需代码测试、构建或浏览器 E2E

## Round 4 Verify Record

1. 核对 ISO 19450:2024 `14.2.4.1.4`、`A.3.1`、`A.4.1/A.4.3`、`A.4.5.4`、`A.4.6` 与 `10.4.1~10.4.2`；确认标准不存在 Clause 15。
2. Control concrete matrix 自动检查为 `20/20`，8 个 Control Capability 与允许的 10 个基础 Procedural Capability 映射顺序、数量均符合冻结表。
3. Structural concrete 表自动检查为 `10/10`，并补齐 Specialized Object -> Attribute Value State 与 Object/owned State 的端点限制。
4. 本轮 18 份文档的相对链接、Markdown 表格列数和尾随空白检查通过；未发现仍写“性能阈值/时限待冻结”的旧口径。
5. 所有 `Clause 15` 字样均处于“不存在/不得引用/已纠正”的说明中，没有把它继续作为标准来源。
6. 产品需求、验收矩阵、测试策略、执行包、DEV-CANVAS-06 spec/checklist 的 `100/500 ms`、`32/50 ms`、`10/15/60 s` 门槛一致。
7. 已跟踪文件的限定 `git diff --check` 通过；未跟踪规格/checklist 由独立尾随空白和表格检查覆盖。
8. 本任务只修改需求/设计/spec/checklist/索引，无需运行代码构建、单元测试或浏览器 E2E；运行证据由 DEV-CANVAS-05/06 承接。
