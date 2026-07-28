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

## Verify Record

1. 7 份本任务文档的 Markdown 相对链接检查通过。
2. 专题设计与符号契约均为 Procedural `16/16`、Control `8/8`、Structural `10/10`。
3. State 和十类关键英文关系术语存在性检查通过。
4. Markdown 表格列数检查和 7 份文档尾随空白检查通过。
5. `git diff --check` 通过；当前这些文档均为未跟踪文件，因此同时使用独立逐行检查覆盖其内容。
6. 本任务只修改设计文档，无需运行代码测试、构建或浏览器 E2E；这些证据由 DEV-CANVAS-00~06 承接。
