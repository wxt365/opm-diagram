# Task Checklist: OPM DEV-CANVAS-04 Structural Links

## Spec Mapping

- 规格：`specs/opm-dev-canvas-04-structural-links-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`frontend-vue`、`testing`、`design-module-docs`
- 目标：10 类 Structural Capability 的候选、命令、Projection、X6 与 P03 闭环，Fundamental fan 保持单一 Fact 和稳定 ID。
- 非目标：具体 Structural OPL/Trace、Procedural、Control、migration、P01/P02。
- 约束：默认 Object-Process Structural 阻断；Exhibition 例外按 Endpoint Schema；`CAP-ISO-STRUCT-009` 为 Specialized Object -> Attribute Value State；`CAP-ISO-STRUCT-010` 仅 Object/owned State；完整性只属于 Aggregation/Exhibition/Generalization，Classification 不显示。
- 验收：资产闭合、端点/标签反例、fan roundtrip、X6/组件测试与 Runtime E2E。
- 验证：资产 digest、契约、后端/前端测试、Java 21 定向测试、Playwright、diff check。
- 回滚：关闭 Structural candidate/编辑入口；保留历史 Structural Fact/fan 的只读投影与稳定身份。

## 分析

- [x] 确认 10 项 Capability、端点概要、Symbol ID、标签槽位与 OPL template family 已在设计冻结。
- [x] 确认 Structural 默认不连接 Object 与 Process，Exhibition 例外由 Endpoint Schema 决定。
- [x] 确认 Fundamental fan 是单一 Fact 的集合状态，成员变更不得复制 Fact 或改变稳定 ID。
- [x] 核对当前 Profile/Rule/Grammar/Symbol、命令 union、Projection 和 P03 的可复用扩展点。
- [x] 识别 Build 阻断：`SemanticFact`、Revision JSON Schema 和 Profile Capability Schema 未承接 Structural 的标签槽位、fan 集合完整性和 junction/label 语义；不得将这些正式字段伪装为未声明 Modifier。

## 已决设计与遗留项

- [x] Structural Fact 使用受控核心字段 `labels` 与 `collection_completeness`；fan 的首端为 refineable、其余端为 refinee，Classification 固定为 `NOT_APPLICABLE`。
- [x] 上述字段已同步至核心元模型、Revision JSON Schema、Profile Package Field Schema 与 Runtime Reader/Writer，旧 Revision 缺省时分别回读为空标签、空 modifier 和 `NOT_APPLICABLE`。
- [x] 为 `CAP-ISO-STRUCT-006` 与 `CAP-ISO-STRUCT-009` 冻结最小 Feature 契约：`CREATE_FEATURE`、Attribute/Operation capability、Feature State owner、Feature/Value State construct role 和拒绝范围；不得以 Object/Process 伪造端点。
- [x] P03 已提供 Structural 创建表单，以及使用 Runtime `UPDATE_FACT` option 的既有 Structural Fact 编辑入口。
- [x] Structural concrete 句式、双向/互惠句数、fan/list/completeness、Token/Trace 和 golden 输入已冻结；机器实现与证据归属 `DEV-CANVAS-05`。

## 实现

- [x] 补齐 10 项 Profile/Rule/Grammar/Symbol 资产及 manifest digest 验证。
- [x] 扩展 Option contract、生成 DTO 与 Runtime Structural candidate。
- [x] 实现已支持端点的 Structural command 原子守卫、双向标签和 fan 成员更新/Revision 重开。
- [x] 实现已支持端点的 Projection/X6 marker、标签与完整性标记，以及 P03 创建和更新入口。
- [x] 扩展 Revision、Reader/Writer、Validator、Runtime candidate/command、Projection/X6 与 P03，以支持 Attribute/Operation Feature、Feature Value State、`CAP-ISO-STRUCT-006` 和 `CAP-ISO-STRUCT-009`；旧 Revision 缺省 Feature 字段保持可读。
- [x] 覆盖 10 项命令/Projection，含端点、标签、fan、完整性与 Classification 反例；Java 21 独立 JUnit Console 已执行 `LocalApiServiceTest` 16/16，006/009 的 Feature Runtime 正反例已覆盖。
- [x] 覆盖代表性 Structural Runtime 浏览器提交、重开和稳定 Fact ID 路径；Local Runtime Playwright 已验证 003 双向标签、005 Aggregation 不完整/完整更新与稳定 Fact ID、006/009 的 Attribute、Feature Value State、完整 fan 与刷新重开。

## 验证与交付

- [x] 执行 contract generate/check/validate 与资产 digest 校验。
- [x] 执行 typecheck 与 WorkbenchView 定向 Vitest。
- [x] 执行 Java 21 定向 Structural Runtime 测试；Maven 仍被用户级 `.m2` 写权限和不可达 Nexus 阻断，改用本地缓存依赖的独立 JUnit Console，`LocalApiServiceTest` 16/16 通过。
- [x] 执行 Local Runtime E2E、桌面/移动布局验收与 diff check；tagged/Aggregation fan、Feature Structural 与既有 P01-P03 多视口 Playwright 主路径均通过。
