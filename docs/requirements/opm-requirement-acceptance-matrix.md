# OPM 单机建模工具需求验收追踪矩阵

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`；验收设计冻结，执行证据按开发包记录

全局设计状态、延期边界和开发准入以 `docs/design/opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-07-30

## Task Type

- `feature`

## 1. 文档定位

本文档将产品需求、非功能需求和配置档能力逐项映射到可执行的验收设计，作为后续测试方案、自动化用例、原型验收和发布证据的统一追踪入口。

本文档中的“预期结果”是实现必须满足的判定口径，不表示当前产品已经实现或测试通过。本次设计冻结不复核当前应用代码、自动化测试结果、代表性模型执行记录或外部工具互操作证据，因此不得据此宣称产品符合 ISO 19450:2024。

## 2. 输入与边界

### 2.1 输入基线

1. `docs/design/opm-design-freeze-baseline.md` `1.0`
2. `docs/requirements/opm-online-modeling-tool-requirements.md` `v1.0`
3. `docs/requirements/opm-profile-capability-matrix.md` `v1.0`
4. `docs/requirements/iso-19450-2024-conformance-matrix.md` `v1.0`
5. `docs/requirements/opm-common-semantic-core.md` `v1.0`
6. `docs/design/opm-modeling-workbench-page-design.md` `v1.0`
7. `docs/design/opm-modeling-workbench-state-model.md` `v1.0`
8. `docs/design/opm-modeling-workbench-field-region-detail.md` `v1.0`
9. `docs/design/opm-modeling-workbench-component-interaction.md` `v1.0`
10. `docs/design/opm-modeling-tool-application-api-contract.md` `v1.0`
11. `docs/design/opm-modeling-tool-persistence-contract.md` `v1.0`
12. `docs/design/opm-native-exchange-package-contract.md` `v1.0`
13. `docs/design/opm-core-metamodel-field-schema.md` `v1.0`
14. `docs/design/opm-profile-package-field-schema.md` `v1.0`
15. `docs/design/opm-rule-definition-field-schema.md` `v1.0`
16. `docs/design/opm-development-execution-pack.md` `v1.0`
17. `docs/design/opm-test-strategy.md` `v1.0`

JSON Schema 样例、OpenAPI、SQLite V1 和原型浏览器验收属于“设计资产验证”，不替代未来生产代码、迁移、安装包和 E2E 的验收证据。各 AT-* 只有在对应生产实现上执行并保存环境/输入/结果后才能标记 PASS。
18. `reference/ISO+19450-2024.pdf`
19. `reference/自动化系统与集成 对象过程语言-20250914.pdf`
20. `reference/基于OPL的架构建模方法20260425.pdf`

### 2.2 本轮覆盖

- 98 项 `FR-*` 功能需求；
- 25 项 `NFR-*` 非功能需求；
- 96 项 `CAP-*` 配置档能力；
- 正向、反向、禁止、派生和跨配置档验收路径；
- 验收证据字段和首期发布门槛。

### 2.3 本轮不覆盖

- ISO 19450:2024 每个“shall”的完整条款级符合性矩阵；
- Annex A 每条 EBNF 产生式的语法测试；
- 图形符号尺寸、锚点、线型和组合绘制的像素级规范；
- 测试代码、测试执行结果和缺陷记录；
- 外部 OPM 工具交换格式和互操作结论。

## 3. 验收规则

### 3.1 结果状态

| 状态 | 含义 |
| --- | --- |
| `NOT_RUN` | 已设计但尚未执行，本文档当前所有用例的初始状态 |
| `PASS` | 实际结果与预期结果一致，且证据完整 |
| `FAIL` | 实际结果与预期结果不一致 |
| `BLOCKED` | 因前置设计、实现、环境或数据缺失无法执行 |
| `N/A` | 经评审确认不适用于当前发布配置档，并记录理由 |

### 3.2 配置档能力判定

| 能力状态 | 必须验证的行为 |
| --- | --- |
| `MUST` | 正向创建、合法端点、序列化重开、文本生成和规则校验全部通过；至少覆盖一个非法端点或非法组合反例 |
| `SHOULD` | 已声明支持时按 `MUST` 验证；未实现时必须出现在能力报告中，且界面不得伪装为可用 |
| `DERIVED` | 不暴露为独立公共类型；标准等价构造能够表达、保存、生成文本并追溯来源 |
| `FORBIDDEN` | 元素面板、关系菜单、导入和配置档转换均阻止该能力被静默写入模型 |
| `N/A` | 当前配置档不暴露、不生成、不接受该能力；不得用 `N/A` 规避本应执行的禁止测试 |

### 3.3 发布门槛

1. 所有 `MUST` 功能需求和配置档能力必须为 `PASS`。
2. 所有阻断性 `NFR-*` 必须按冻结阈值为 `PASS`；输入、环境或执行证据缺失时只能标记 `BLOCKED`，不能静默通过。
3. `SHOULD` 未实现项必须列入能力报告或发布偏差清单，并由产品评审接受。
4. `COULD` 不阻断首期发布，但不得显示为已支持。
5. 任一 `FORBIDDEN` 能力被静默接受，或任一图文等价、原子保存、基线只读测试失败，均阻断发布。
6. ISO 最终符合性声明还必须具备条款级规则、自动化测试和代表性互操作证据；本矩阵通过不能单独形成 ISO 符合性结论。

### 3.4 证据要求

每次执行至少记录：用例编号、需求或能力编号、产品版本、配置档及版本、测试数据版本、执行环境、实际结果、结果状态、执行时间和证据链接。界面验收保留截图或录像，数据验收保留导出物与结构化断言，性能验收保留采样方法和原始结果。

## 4. 测试数据集

| 数据编号 | 数据集 | 用途 |
| --- | --- | --- |
| TD-PROJ | 空白目录、含单模型项目、含多模型项目、已归档项目 | 项目生命周期、搜索、归档恢复 |
| TD-ISO-BASE | ISO 配置档代表性模型：SD、过程细化树、对象细化森林、状态、结构/过程关系和 System map | ISO 正向主路径 |
| TD-CN-BASE | 中文草案配置档代表性模型：值域、值、流、命名空间、可见性和中文扩展 | 中文草案正向主路径 |
| TD-MULTI-OPD | 同一元素和 Model Fact 出现在多个 OPD，包含父子概要/细化和 model view | 跨图身份、导航、图文汇总 |
| TD-INVALID | 非法端点、重名、孤立引用、未知类型、非法修饰和不可生成文本的模型变体 | 阻断和错误定位 |
| TD-CROSS | 含位置、权属、完整布尔、局部重名、值域/值和 `-e/un` 的中文模型 | 中文草案转 ISO 预检 |
| TD-VERSION | 同一模型的草稿、两个命名快照、一个只读基线和差异集 | 版本、基线、比较和追溯 |
| TD-IO | 合法原生包、未知版本包、损坏包、超限包和部分写入故障注入 | 导入、导出、原子性和安全校验 |
| TD-METHOD | 含任务/功能/产品三层、`6×1` 角色和功能信息模式缺口的模型 | 架构方法验收 |
| TD-LOCAL | 本地存储目录、备份目录、恢复目录和无网络环境 | 单机运行、备份恢复、操作记录 |
| TD-CAP-ISO | 按每个 `CAP-*` 生成的 ISO 合法样例及至少一个非法端点、组合或禁用样例 | ISO 能力逐项验证 |
| TD-CAP-CN | 按每个 `CAP-*` 生成的中文草案合法样例及至少一个非法端点、组合或禁用样例 | 中文能力逐项验证 |
| TD-PERF-OPD | 300 个可见结点和 600 条关系的单 OPD | 画布性能 |
| TD-PERF-MODEL | 10,000 个结点、跨多 OPD 的模型 | 保存、快照和全量校验容量 |

测试数据必须固定机器标识、配置档版本和预期文本，不得只靠人工临时绘图形成不可复现样例。

## 5. 功能需求验收矩阵

验证方式缩写：`E2E` 为本地浏览器端到端测试，`INT` 为跨模块集成测试，`RULE` 为规则引擎参数化测试，`DATA` 为结构化文件断言，`MANUAL` 为人工可用性检查。

### 5.1 项目与模型管理

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-PROJ-001 | AT-FR-PROJ-001 项目生命周期 | TD-PROJ | 创建、改名、归档和恢复均成功，归档项目不混入默认活动列表 | E2E + DATA | 主需求 10.1 |
| FR-PROJ-002 | AT-FR-PROJ-002 项目字段持久化 | TD-PROJ | 名称、说明、默认配置档、存储位置和创建时间保存重开后不丢失 | E2E + DATA | 主需求 10.1 |
| FR-PROJ-003 | AT-FR-PROJ-003 多模型容器 | TD-PROJ | 同一项目可创建并独立打开多个模型，身份与内容不串扰 | E2E + DATA | 主需求 10.1 |
| FR-PROJ-004 | AT-FR-PROJ-004 空白和模板建模 | TD-PROJ | 两种入口均创建有效模型，模板实例不反向修改模板 | E2E + DATA | 主需求 10.1 |
| FR-PROJ-005 | AT-FR-PROJ-005 配置档选择与切换 | TD-ISO-BASE + TD-CROSS | 创建时必须选择配置档；切换前列出兼容、阻断和有损项，未确认不改模型 | E2E + RULE | 主需求 10.1、11.5 |
| FR-PROJ-006 | AT-FR-PROJ-006 本地搜索 | TD-PROJ + TD-MULTI-OPD | 可按名称定位项目、模型、OPD 和结点，结果打开正确上下文 | E2E | 主需求 10.1 |
| FR-PROJ-007 | AT-FR-PROJ-007 统一语义资产 | TD-MULTI-OPD | 多 OPD 归属同一模型，语义身份统一且不存在按图复制的独立模型 | INT + DATA | 主需求 9.1、10.1 |

### 5.2 OPD 上下文结构与导航

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-OPD-001 | AT-FR-OPD-001 ISO 单根结构 | TD-ISO-BASE + TD-INVALID | 每个 ISO 模型恰有一个 SD process-tree 根；对象根和 view 不计作系统根，第二个 SD 被阻止 | RULE + DATA | ISO 14.1、14.2.2.6.1 |
| FR-OPD-002 | AT-FR-OPD-002 过程与对象细化 | TD-ISO-BASE | 过程细化进入 process tree，对象细化进入 object forest，并记录来源 | E2E + DATA | ISO 14.2.2.6.1 |
| FR-OPD-003 | AT-FR-OPD-003 分类导航 | TD-MULTI-OPD | 三类上下文分开展示，展开、折叠、定位和路径导航结果正确 | E2E | 主需求 10.2 |
| FR-OPD-004 | AT-FR-OPD-004 上下文和命名规则 | TD-ISO-BASE + TD-CN-BASE | OPD 保存上下文；ISO 执行全模型唯一，中文草案执行局部命名空间规则 | RULE + DATA | ISO 7.3.3；中文草案第 12 章 |
| FR-OPD-005 | AT-FR-OPD-005 拥有与引用区分 | TD-MULTI-OPD | 数据可区分 owner/reference，界面同时使用非纯颜色视觉标识 | E2E + DATA | 主需求 10.2、13.4 |
| FR-OPD-006 | AT-FR-OPD-006 删除移动影响分析 | TD-MULTI-OPD | 操作前列出拥有结点、引用、细化和 view 影响；取消后模型不变 | E2E + DATA | 主需求 10.2 |
| FR-OPD-007 | AT-FR-OPD-007 概要详细导航 | TD-MULTI-OPD | 可从概要关系到详细关系并返回，导航不复制事实 | E2E | 主需求 10.2 |
| FR-OPD-008 | AT-FR-OPD-008 重复与泄漏提示 | TD-INVALID | 对重复元素和跨层细节生成建议或警告，不误报为语言合规错误 | RULE + E2E | 主需求 10.2、10.6 |
| FR-OPD-009 | AT-FR-OPD-009 根图类型约束 | TD-ISO-BASE + TD-INVALID | ISO 根图类型固定为 SD，非 SD 根或无 SD 模型不能形成合规基线 | RULE | ISO 14.1 |
| FR-OPD-010 | AT-FR-OPD-010 根图内容检查 | TD-ISO-BASE | 根图表达系统功能、边界和总体上下文；缺项产生可定位问题 | RULE + E2E | ISO 6、14.1 |
| FR-OPD-011 | AT-FR-OPD-011 子图语义归属 | TD-MULTI-OPD + TD-INVALID | 细化 OPD 记录被细化元素、方式和父图；任意孤立子画布被阻止，view 独立管理 | RULE + DATA | ISO 14.2.1、14.2.2.6.1 |
| FR-OPD-012 | AT-FR-OPD-012 跨图稳定身份 | TD-MULTI-OPD | 同一事实跨图共用标识，任一处语义修改同步到全部上下文 | INT + DATA | ISO 14.2.2.6.1.5 |
| FR-OPD-013 | AT-FR-OPD-013 逐图文本和汇总 | TD-MULTI-OPD | 每张 OPD 生成对应段落/章节，模型文本按结构汇总且无事实丢失或重复身份 | INT + DATA | ISO 14.2.2；中文草案第 12 章 |
| FR-OPD-014 | AT-FR-OPD-014 System map | TD-ISO-BASE | map 展示 process tree、图内 Thing/Link，并能定位 Thing 的全部出现和对象细化树 | E2E + DATA | ISO 14.2.2.6.1.5 |
| FR-OPD-015 | AT-FR-OPD-015 Model view | TD-MULTI-OPD + TD-CN-BASE | ISO view 保存条件、事实来源和 OPL；中文草案导出不把 view 声明为原生 OPD | E2E + RULE | ISO 14.2.2.6.1.5；中文草案第 12 章 |

### 5.3 OPD 图形编辑器

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-EDIT-001 | AT-FR-EDIT-001 创建结点 | TD-ISO-BASE + TD-CN-BASE | 拖放、点击或快捷命令只创建当前配置档允许的结点 | E2E + RULE | 能力矩阵第 4 章 |
| FR-EDIT-002 | AT-FR-EDIT-002 创建关系 | TD-CAP-ISO + TD-CAP-CN | 关系入口覆盖矩阵允许的关系族，未列入能力不出现 | E2E + RULE | 能力矩阵第 5、6 章 |
| FR-EDIT-003 | AT-FR-EDIT-003 端点过滤 | TD-INVALID | 候选关系随源、目标和配置档变化；非法关系不能提交 | E2E + RULE | 能力矩阵第 5 至 8 章 |
| FR-EDIT-004 | AT-FR-EDIT-004 基础图形操作 | TD-ISO-BASE | 移动、对齐、分布、复制、粘贴、删除行为可撤销，语义身份规则不被破坏 | E2E + DATA | 主需求 10.3 |
| FR-EDIT-005 | AT-FR-EDIT-005 撤销重做 | TD-ISO-BASE | 连续编辑可逐步撤销和重做，语义、布局和文本保持一致 | E2E + DATA | 主需求 10.3 |
| FR-EDIT-006 | AT-FR-EDIT-006 视口操作 | TD-PERF-OPD | 放大、缩小、平移、框选和定位可用；操作前后语义散列与文本相同 | E2E + DATA | 主需求 3、10.3 |
| FR-EDIT-007 | AT-FR-EDIT-007 属性编辑 | TD-CAP-ISO + TD-CAP-CN | 仅显示并保存配置档允许的名称、类型、可见性、多重性、标签和修饰符 | E2E + RULE | 能力矩阵第 4、7 章 |
| FR-EDIT-008 | AT-FR-EDIT-008 布局语义边界 | TD-ISO-BASE | 普通移动只改布局；内缩放过程垂直偏序变化更新语义和 OPL | E2E + DATA | ISO 14.2.1.3 |
| FR-EDIT-009 | AT-FR-EDIT-009 改名传播 | TD-MULTI-OPD | 改名先校验唯一性，成功后所有引用和文本同步，失败时无部分更新 | INT + DATA | ISO 7.3.3；中文草案第 12 章 |
| FR-EDIT-010 | AT-FR-EDIT-010 临时无效状态 | TD-INVALID | 非法连接提交被阻止；临时状态有显著标识且基线动作不可用 | E2E + RULE | 主需求 9.2、10.3 |
| FR-EDIT-011 | AT-FR-EDIT-011 编辑提示 | TD-CAP-ISO + TD-CAP-CN | 符号、方向和上下文工具提示与当前配置档一致 | MANUAL + E2E | 主需求 10.3 |
| FR-EDIT-012 | AT-FR-EDIT-012 自动布局 | TD-MULTI-OPD | 整理前后元素身份、关系、修饰和文本不变，仅布局变化 | E2E + DATA | 主需求 10.3 |
| FR-EDIT-013 | AT-FR-EDIT-013 语义细化操作 | TD-ISO-BASE | 三对机制均可执行并更新上下文与 OPL，命令与视口缩放明确区分 | E2E + RULE | ISO 14.2.1 |

### 5.4 OPL 元素与关系能力

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-META-001 | AT-FR-META-001 公共语义内核 | TD-ISO-BASE + TD-CN-BASE | 公共对象、过程和关系无损保存；同名但语义不同的能力不被错误合并 | RULE + DATA | 主需求 9.1、11.1 |
| FR-META-002 | AT-FR-META-002 中文扩展元素 | TD-CN-BASE | 中文配置档可创建值域、值和流并生成正确符号与 OPT；ISO 中被阻止 | E2E + RULE | 中文草案第 8 章 |
| FR-META-003 | AT-FR-META-003 静态关系全覆盖 | TD-CAP-ISO + TD-CAP-CN | 每项 `MUST` 静态/Structural 关系通过正反例、重开和文本断言 | RULE + DATA | 能力矩阵 5.3、6.1 |
| FR-META-004 | AT-FR-META-004 动态关系全覆盖 | TD-CAP-ISO + TD-CAP-CN | 每项 `MUST` 动态/Procedural 关系通过角色、控制、重开和文本断言 | RULE + DATA | 能力矩阵 5.1、5.2、6.2 |
| FR-META-005 | AT-FR-META-005 修饰机制全覆盖 | TD-CAP-ISO + TD-CAP-CN | 多重性、路径、逻辑、概率、状态指定、条件和事件的合法及非法组合均被正确判定 | RULE | 能力矩阵第 7 章 |
| FR-META-006 | AT-FR-META-006 过程分解与优先级 | TD-ISO-BASE + TD-CN-BASE | 过程分解保存同步、异步和因果顺序，文本与执行语义顺序一致 | RULE + DATA | ISO 12、14；中文草案第 10、12 章 |
| FR-META-007 | AT-FR-META-007 可见性隔离 | TD-CN-BASE + TD-INVALID | 中文配置档执行公开/保护/私有引用规则；ISO 数据和界面均无该属性 | E2E + RULE | 中文草案第 12 章；ISO 7.3.3 |
| FR-META-008 | AT-FR-META-008 中文专属关系 | TD-CROSS | 中文能力可创建并带来源标识；ISO 切换预检逐项给出转换结论 | RULE + DATA | 中文草案第 9 至 12 章 |
| FR-META-009 | AT-FR-META-009 受控导入 | TD-CN-BASE | 已实现时导入元素保留来源模型、版本和稳定身份；未实现时列入能力报告 | INT + DATA | 中文草案第 12 章 |
| FR-META-010 | AT-FR-META-010 状态规则动作表达 | TD-ISO-BASE + TD-CN-BASE | 状态、规则和动作只使用配置档标准构造，不产生无依据公共元素类型 | RULE + DATA | ISO 7 至 14；中文草案第 8 至 12 章 |
| FR-META-011 | AT-FR-META-011 未知能力封闭 | TD-INVALID | 面板、菜单、导入器和生成器均拒绝未知公共类型并给出规则错误 | E2E + RULE | 能力矩阵第 3、10 章 |
| FR-META-012 | AT-FR-META-012 能力报告 | TD-CAP-ISO + TD-CAP-CN | 报告列出 MUST、SHOULD 实现状态、FORBIDDEN、规则版本和证据版本 | INT + DATA | 能力矩阵第 10 章 |

### 5.5 OPL/OPT 实时生成与图文联动

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-TEXT-001 | AT-FR-TEXT-001 增量文本生成 | TD-ISO-BASE + TD-CN-BASE | 每次有效语义变更仅重算受影响文本且最终内容正确 | INT + DATA | ISO Annex A、第 7 至 14 章；中文草案 |
| FR-TEXT-002 | AT-FR-TEXT-002 只读文本视图 | TD-ISO-BASE | 文本不可直接改写语义模型，不存在第二事实源入口 | E2E + DATA | 主需求 9.1、9.2 |
| FR-TEXT-003 | AT-FR-TEXT-003 配置档句式 | TD-CAP-ISO + TD-CAP-CN | ISO 生成英文 OPL，中文配置档生成 OPT；保留字、语序和标点匹配规则版本 | RULE + DATA | ISO Annex A；中文草案 |
| FR-TEXT-004 | AT-FR-TEXT-004 双向选择联动 | TD-MULTI-OPD | 选图定位全部对应语句，选句定位正确 OPD 和元素 | E2E | ISO Annex C、14.2.2 |
| FR-TEXT-005 | AT-FR-TEXT-005 多对多追溯 | TD-MULTI-OPD | 一对多和多对一映射完整保存，任一侧均可追溯 | INT + DATA | ISO Annex C |
| FR-TEXT-006 | AT-FR-TEXT-006 文本不可生成阻断 | TD-INVALID | 产生含规则编号的阻断错误，模型不能生成基线 | RULE + E2E | 主需求 10.5、10.6 |
| FR-TEXT-007 | AT-FR-TEXT-007 文本导出元数据 | TD-VERSION | 导出物包含准确的模型版本、配置档及生成时间 | DATA | 主需求 10.5 |
| FR-TEXT-008 | AT-FR-TEXT-008 文本范围 | TD-MULTI-OPD | 已实现时可按当前图、子树和全模型查看导出，范围边界正确 | E2E + DATA | 主需求 10.5 |
| FR-TEXT-009 | AT-FR-TEXT-009 文本差异 | TD-VERSION | 已实现时差异准确标出新增、删除和修改语句并关联模型差异 | E2E + DATA | 主需求 10.5 |

### 5.6 语义校验与质量检查

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-VAL-001 | AT-FR-VAL-001 问题分级 | TD-INVALID | 阻断错误、警告、建议三级可区分，只有阻断错误阻止基线 | RULE + E2E | 主需求 10.6 |
| FR-VAL-002 | AT-FR-VAL-002 规则维度覆盖 | TD-INVALID | 类型、端点、方向、多重性、命名、可见性和跨图引用均有命中反例 | RULE | 能力矩阵 |
| FR-VAL-003 | AT-FR-VAL-003 图文完整性 | TD-MULTI-OPD + TD-INVALID | 检出不可生成文本、缺映射和悬空映射，不误通过 | RULE + DATA | ISO Annex C |
| FR-VAL-004 | AT-FR-VAL-004 配置档外能力 | TD-CROSS | 每个配置档外元素、属性和关系均被定位并说明兼容性影响 | RULE | 主需求 11.5 |
| FR-VAL-005 | AT-FR-VAL-005 问题信息完整 | TD-INVALID | 每条问题含规则编号、说明、OPD、元素和可执行修复建议 | RULE + E2E | 主需求 10.6 |
| FR-VAL-006 | AT-FR-VAL-006 问题定位 | TD-INVALID | 点击问题打开正确 OPD，并定位和突出相关元素 | E2E | 主需求 10.6 |
| FR-VAL-007 | AT-FR-VAL-007 阻断基线 | TD-INVALID | 存在任一阻断错误时生成基线入口不可成功，原版本状态不变 | E2E + DATA | 主需求 12.2 |
| FR-VAL-008 | AT-FR-VAL-008 质量建议 | TD-INVALID | 已实现时识别歧义、孤立、未使用和疑似重复项，并可定位 | RULE + E2E | 主需求 10.6 |
| FR-VAL-009 | AT-FR-VAL-009 方法与合规分栏 | TD-METHOD + TD-INVALID | 方法建议与语言合规问题分别展示、筛选和统计 | E2E + DATA | 架构方法草案；主需求 10.6 |

### 5.7 架构建模方法支持

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-METHOD-001 | AT-FR-METHOD-001 架构分类 | TD-METHOD | 模型或 OPD 可标记任务、功能、产品架构，重开后保持 | E2E + DATA | 架构方法草案 |
| FR-METHOD-002 | AT-FR-METHOD-002 三层追溯 | TD-METHOD | 输入、生成和追溯关系可从上下游双向查询 | INT + DATA | 架构方法草案 |
| FR-METHOD-003 | AT-FR-METHOD-003 6x1 检查 | TD-METHOD | 主体、客体、手段、资源、环境、信息和过程均被检查，缺项可定位 | RULE + E2E | 架构方法草案 |
| FR-METHOD-004 | AT-FR-METHOD-004 功能信息模式 | TD-METHOD | 已实现时覆盖观测、识别、规划决策、控制、执行和数据链路 | RULE + E2E | 架构方法草案 |
| FR-METHOD-005 | AT-FR-METHOD-005 架构决策记录 | TD-METHOD | 已实现时问题、方案、依据、决策和影响范围形成可追溯记录 | E2E + DATA | 架构方法草案 |
| FR-METHOD-006 | AT-FR-METHOD-006 功能实现追溯 | TD-METHOD | 已实现时一般功能、特殊功能和实现系统可双向追踪 | INT + DATA | 架构方法草案 |
| FR-METHOD-007 | AT-FR-METHOD-007 功能边界 | TD-METHOD | 已实现时检查条件边界、效果边界及对应缺口 | RULE | 架构方法草案 |
| FR-METHOD-008 | AT-FR-METHOD-008 提示处置 | TD-METHOD | 已实现时提示可确认、豁免或转待办；豁免理由必填且可追溯 | E2E + DATA | 架构方法草案 |

### 5.8 本地版本与基线

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-VER-001 | AT-FR-VER-001 自动保存 | TD-VERSION | 草稿自动保存，状态和最后保存时间与持久化结果一致 | E2E + DATA | 主需求 10.8 |
| FR-VER-002 | AT-FR-VER-002 命名快照 | TD-VERSION | 快照名称和变更说明保存，快照内容固定且可重开 | E2E + DATA | 主需求 10.8 |
| FR-VER-003 | AT-FR-VER-003 版本比较 | TD-VERSION | 元素、关系、属性、布局和文本差异完整且按稳定身份对齐 | INT + DATA | 主需求 10.8 |
| FR-VER-004 | AT-FR-VER-004 基线前置校验 | TD-VERSION + TD-INVALID | 仅无阻断错误版本可生成基线 | E2E + RULE | 主需求 10.8、12.2 |
| FR-VER-005 | AT-FR-VER-005 基线只读 | TD-VERSION | 基线不可原地修改，编辑操作只允许先创建新草稿 | E2E + DATA | 主需求 12.2 |
| FR-VER-006 | AT-FR-VER-006 基线元数据 | TD-VERSION | 模型版本、配置档版本、校验结果、说明和生成时间完整且不可改写 | DATA | 主需求 10.8 |

### 5.9 导入、导出与交换

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-IO-001 | AT-FR-IO-001 原生格式标识 | TD-IO | 原生包具有格式版本和配置档标识，缺失时拒绝导入 | DATA + INT | 主需求 10.9 |
| FR-IO-002 | AT-FR-IO-002 原生往返 | TD-ISO-BASE + TD-CN-BASE | 导出再导入后身份、层级、语义、布局和版本元数据等价 | DATA + INT | 主需求 10.9 |
| FR-IO-003 | AT-FR-IO-003 图文导出 | TD-MULTI-OPD | 当前 OPD 或全模型可导出 SVG/PNG 和对应配置档文本，内容范围正确 | E2E + DATA | 主需求 10.9 |
| FR-IO-004 | AT-FR-IO-004 导入原子性 | TD-IO | 结构、版本或配置档校验失败时无任何部分覆盖 | INT + DATA | 主需求 10.9、13.2 |
| FR-IO-005 | AT-FR-IO-005 PDF 报告 | TD-VERSION | 已实现时报告包含清晰 OPD、文本、校验和版本信息 | MANUAL + DATA | 主需求 10.9 |
| FR-IO-006 | AT-FR-IO-006 转换预检 | TD-CROSS | 已实现时逐项列出无损、扩展、有损和无法映射结果，不修改源模型 | RULE + DATA | 主需求 11.5 |
| FR-IO-007 | AT-FR-IO-007 外部互操作 | 待确定交换样例 | 完成格式调研并声明支持后，代表性模型双向交换语义不丢失；首期未声明时为 N/A | INT + MANUAL | ISO 19450:2024；待调研 |

### 5.10 本地数据与操作记录

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-LOCAL-001 | AT-FR-LOCAL-001 本地持久化 | TD-LOCAL | 模型、配置档、版本、基线和操作记录均写入可识别的本地位置 | INT + DATA | 主需求第 6 章、10.10 |
| FR-LOCAL-002 | AT-FR-LOCAL-002 离线核心流程 | TD-LOCAL | 无网络、无登录状态下可完成创建、编辑、校验、保存、基线和导出 | E2E | 主需求第 6 章 |
| FR-LOCAL-003 | AT-FR-LOCAL-003 操作历史覆盖 | TD-LOCAL | 创建、修改、删除、导入、生成基线和恢复均产生一条结果准确的记录 | INT + DATA | 主需求 10.10 |
| FR-LOCAL-004 | AT-FR-LOCAL-004 操作记录字段 | TD-LOCAL | 每条记录含本地时间、动作、对象和结果，且没有虚构用户身份 | DATA | 主需求 10.10 |
| FR-LOCAL-005 | AT-FR-LOCAL-005 完整备份恢复 | TD-LOCAL + TD-IO | 合法备份在新目录完整恢复；不兼容备份在写入前阻止 | E2E + DATA | 主需求 10.10 |
| FR-LOCAL-006 | AT-FR-LOCAL-006 自动备份策略 | TD-LOCAL | 已实现时位置和保留数量可配置，轮转结果与策略一致 | INT + DATA | 主需求 10.10 |

### 5.11 业务语义资产

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| FR-ASSET-001 | AT-FR-ASSET-001 资产聚合 | TD-VERSION + TD-MULTI-OPD | 模型可完整枚举 OPD、元素、关系、文本、配置档、版本、校验和基线 | INT + DATA | 主需求 9.6、10.11 |
| FR-ASSET-002 | AT-FR-ASSET-002 稳定标识 | TD-VERSION + TD-MULTI-OPD | 跨图和未删除元素跨版本标识稳定，差异和引用按标识关联 | DATA | 主需求 10.11 |
| FR-ASSET-003 | AT-FR-ASSET-003 基线完整性 | TD-VERSION | 基线包含全部 OPD、对应文本、配置档版本、校验和元数据 | DATA | 主需求 10.11 |
| FR-ASSET-004 | AT-FR-ASSET-004 资产包往返 | TD-VERSION + TD-LOCAL | 在新目录恢复后 OPD 层级、身份、关系和图文映射等价 | INT + DATA | 主需求 10.11 |
| FR-ASSET-005 | AT-FR-ASSET-005 本体边界 | TD-VERSION | 未经映射校验发布的包只标为 OPM 上游语义源，不出现“已发布本体”状态 | RULE + DATA | 主需求 9.6、10.11 |
| FR-ASSET-006 | AT-FR-ASSET-006 本体发布包 | 待定义映射样例 | 已实现时包含源基线、配置档、稳定标识、映射、未映射项和校验结论 | INT + DATA | 主需求 10.11 |

## 6. 非功能需求验收矩阵

| 需求编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 来源 |
| --- | --- | --- | --- | --- | --- |
| NFR-PERF-001 | AT-NFR-PERF-001 编辑反馈延迟 | TD-ISO-BASE | 约定硬件和浏览器下普通编辑操作的用户可见反馈 P95 不超过 100 ms | 性能自动化 | 主需求 13.1 |
| NFR-PERF-002 | AT-NFR-PERF-002 文本更新延迟 | TD-ISO-BASE + TD-CN-BASE | 有效语义变更到受影响文本可见的 P95 不超过 500 ms | 性能自动化 | 主需求 13.1 |
| NFR-PERF-003 | AT-NFR-PERF-003 大图交互 | TD-PERF-OPD + 设计压力集 | 300/600 下 frame P95 `<=32 ms`、选择 P95 `<=100 ms`；1,000/2,000 下分别 `<=50 ms`、`<=200 ms`；零功能失效、零 OOM | 性能自动化 + MANUAL | 主需求 13.1、DEV-CANVAS-06 |
| NFR-PERF-004 | AT-NFR-PERF-004 大模型任务 | TD-PERF-MODEL | 10,000 结点模型的保存/快照/全量校验每次分别 `<=10/15/60 s`，各 5 次零失败且结果完整 | 性能自动化 | 主需求 13.1、DEV-CANVAS-06 |
| NFR-REL-001 | AT-NFR-REL-001 图文持久一致 | TD-ISO-BASE + 故障注入 | 任一已确认保存版本的图、语义模型和文本版本一致，不存在半更新状态 | INT + DATA | 主需求 13.2 |
| NFR-REL-002 | AT-NFR-REL-002 保存失败保护 | TD-IO | 写入失败时保留未提交编辑并显示失败，重开后不出现虚假成功版本 | E2E + 故障注入 | 主需求 13.2 |
| NFR-REL-003 | AT-NFR-REL-003 保存幂等 | TD-VERSION | 同一保存请求重复提交不产生重复元素、操作效果或版本 | INT + DATA | 主需求 13.2 |
| NFR-REL-004 | AT-NFR-REL-004 原子变更 | TD-IO + TD-CROSS | 导入、迁移、基线发布任一步失败均回到操作前完整状态 | INT + 故障注入 | 主需求 13.2 |
| NFR-REL-005 | AT-NFR-REL-005 异常恢复 | TD-LOCAL + 故障注入 | 进程异常后可恢复最近一次已确认保存版本，未确认编辑按恢复策略明确呈现 | E2E + DATA | 主需求 13.2 |
| NFR-SEC-001 | AT-NFR-SEC-001 无身份模块 | TD-LOCAL | 首期核心流程无登录、角色授权或权限审计前置，数据中不伪造身份 | E2E + DATA | 主需求第 6 章、13.3 |
| NFR-SEC-002 | AT-NFR-SEC-002 本机监听 | 本地网络检查 | 默认仅监听 loopback，不接受非本机接口连接 | 网络自动化 | 主需求 13.3 |
| NFR-SEC-003 | AT-NFR-SEC-003 文件安全校验 | TD-IO | 非法格式、超限、危险内容和损坏文件在解析或写入前被拒绝 | 安全自动化 + INT | 主需求 13.3 |
| NFR-SEC-004 | AT-NFR-SEC-004 防部分写入 | TD-IO + 故障注入 | 写入中断不损坏最近有效模型、版本或基线，可检测并清理临时文件 | INT + DATA | 主需求 13.3 |
| NFR-SEC-005 | AT-NFR-SEC-005 存储位置可见 | TD-LOCAL | 项目和备份位置在创建、设置和备份结果中可确认并可打开定位 | E2E | 主需求 13.3 |
| NFR-SEC-006 | AT-NFR-SEC-006 敏感信息排除 | TD-IO + 敏感值样例 | 模型和全部导出物扫描不到密钥、令牌或应用敏感配置 | 安全自动化 + DATA | 主需求 13.3 |
| NFR-UX-001 | AT-NFR-UX-001 键鼠等价 | TD-ISO-BASE | 核心创建、连接、选择、删除、撤销、保存和校验均可用鼠标及键盘完成 | E2E + MANUAL | 主需求 13.4 |
| NFR-UX-002 | AT-NFR-UX-002 非纯颜色表达 | TD-INVALID + TD-CN-BASE | 状态、错误等级和可见性同时具备文字、形状、图标或线型线索 | MANUAL + 视觉回归 | 主需求 13.4 |
| NFR-UX-003 | AT-NFR-UX-003 图标可理解 | 全部工具栏和上下文菜单 | 陌生图标均有可访问名称或悬停工具提示，键盘聚焦可读取 | E2E + MANUAL | 主需求 13.4 |
| NFR-UX-004 | AT-NFR-UX-004 错误可读性 | TD-INVALID | 错误含业务说明和修复建议，不仅显示规则代码 | MANUAL + E2E | 主需求 13.4 |
| NFR-UX-005 | AT-NFR-UX-005 浏览器矩阵 | Playwright 1.57.0：Chromium `143.0.7499.4`、Firefox `144.0.2`、WebKit `26.0` | Chromium 通过全部发布 Gate；Firefox/WebKit 通过核心主路径；不受支持的默认浏览器进入阻断页且无写命令 | 跨浏览器 E2E + launcher smoke | 主需求 13.4；冻结基线第 3 章 |
| NFR-UX-006 | AT-NFR-UX-006 界面与模型语言 | 中英文及其他 Unicode 名称样例 | 界面至少为简体中文，模型名称可保存、显示、搜索和导出其他语言 | E2E + DATA | 主需求 13.4 |
| NFR-MAINT-001 | AT-NFR-MAINT-001 规则资产版本化 | TD-VERSION | 元模型、配置档、生成和校验规则均有不可歧义版本标识 | DATA | 主需求 13.5 |
| NFR-MAINT-002 | AT-NFR-MAINT-002 文本规则追溯 | TD-CAP-ISO + TD-CAP-CN | 任一正式语句可定位元素、Model Fact 和生成规则版本 | INT + DATA | ISO Annex C；主需求 13.5 |
| NFR-MAINT-003 | AT-NFR-MAINT-003 校验规则追溯 | TD-INVALID | 任一校验结论可定位规则及配置档版本 | INT + DATA | 主需求 13.5 |
| NFR-MAINT-004 | AT-NFR-MAINT-004 规则升级稳定性 | TD-VERSION + 两个规则版本 | 旧基线结果保持原规则快照；新规则重检形成独立迁移记录，不原地改写 | INT + DATA | 主需求 13.5 |

## 7. 配置档能力验收矩阵

每个 `AT-CAP-*` 都必须按对应配置档状态执行第 3.2 节规定的公共断言。表中“预期结果”只补充该能力的专属判定，不替代创建、端点、往返、文本和反例测试。

### 7.1 元素与属性能力

| 能力编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 标准来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-ELEM-001 | AT-CAP-ELEM-001 Thing | TD-CAP-ISO + TD-CAP-CN | ISO 不暴露抽象 Thing 实例；中文配置档可创建并生成 OPT | RULE + DATA | ISO 6.2.2、7.3；中文第 8 章 |
| CAP-ELEM-002 | AT-CAP-ELEM-002 Object | TD-CAP-ISO + TD-CAP-CN | 两配置档均支持稳定身份、合法名称和属性的 Object | RULE + DATA | ISO 7.1；中文第 8 章 |
| CAP-ELEM-003 | AT-CAP-ELEM-003 Process | TD-CAP-ISO + TD-CAP-CN | Process 按配置档连接相关事物；ISO 无 Transforming Link 时产生阻断 | RULE + DATA | ISO 7.2、8.1.2；中文第 8、10 章 |
| CAP-ELEM-004 | AT-CAP-ELEM-004 Object State | TD-CAP-ISO + TD-CAP-CN | ISO State 从属于 Object；中文以值域和值等价表达且不暴露同名独立类型 | RULE + DATA | ISO 7.3.5；中文第 7、8 章 |
| CAP-ELEM-005 | AT-CAP-ELEM-005 Process State | TD-CAP-ISO + TD-CAP-CN | ISO 阻止 Process State；中文通过过程值域和值派生表达 | RULE + DATA | ISO 6.2.3；中文第 7、8 章 |
| CAP-ELEM-006 | AT-CAP-ELEM-006 Value Domain | TD-CAP-ISO + TD-CAP-CN | ISO 创建和导入均阻止；中文可创建、保存和生成 OPT | RULE + DATA | ISO 7.3.5、11.3；中文第 8 章 |
| CAP-ELEM-007 | AT-CAP-ELEM-007 Value | TD-CAP-ISO + TD-CAP-CN | ISO 不接受独立 Value；中文 Value 必须归属合法 Value Domain | RULE + DATA | ISO 7.3.5；中文第 8、9 章 |
| CAP-ELEM-008 | AT-CAP-ELEM-008 Class | TD-CAP-ISO + TD-CAP-CN | ISO 用 classification-instantiation 派生；中文暴露 Class 原生能力 | RULE + DATA | ISO 10.3.5；中文第 8、9 章 |
| CAP-ELEM-009 | AT-CAP-ELEM-009 Flow | TD-CAP-ISO + TD-CAP-CN | ISO 阻止 Flow 结点并用 Procedural Link 表达；中文可创建 Flow | RULE + DATA | ISO 第 8、9 章；中文第 8 章 |
| CAP-ELEM-010 | AT-CAP-ELEM-010 Information | TD-CAP-ISO + TD-CAP-CN | ISO 通过 informatical Object 表达；中文可使用信息事物及专用符号 | RULE + DATA | ISO 7.3.3；中文第 8 章 |
| CAP-ELEM-011 | AT-CAP-ELEM-011 Annotation | TD-CAP-ISO + TD-CAP-CN | ISO 不接受自由 Annotation；中文注释不形成 Model Fact 且不能绕过校验 | RULE + DATA | ISO 3.61、9 至 13；中文第 12 章 |
| CAP-PROP-001 | AT-CAP-PROP-001 Perseverance | TD-CAP-ISO + TD-CAP-CN | ISO 支持合法枚举和默认值；中文通过标准类型派生且无独立同名属性 | RULE + DATA | ISO 7.3.3；中文第 7、8 章 |
| CAP-PROP-002 | AT-CAP-PROP-002 Essence | TD-CAP-ISO + TD-CAP-CN | 两配置档正确区分 physical 与 informatical 并生成对应文本 | RULE + DATA | ISO 7.3.3；中文第 8 章 |
| CAP-PROP-003 | AT-CAP-PROP-003 Affiliation | TD-CAP-ISO + TD-CAP-CN | 两配置档正确区分 systemic 与 environmental，并遵循默认值 | RULE + DATA | ISO 7.3.3、7.3.4；中文草案 |
| CAP-PROP-004 | AT-CAP-PROP-004 状态标记 | TD-CAP-ISO + TD-CAP-CN | ISO State 支持 initial/default/final；中文通过值和控制语义派生 | RULE + DATA | ISO 7.3.5.3、7.3.5.4；中文第 7、8、10 章 |
| CAP-PROP-005 | AT-CAP-PROP-005 全模型唯一 | TD-CAP-ISO + TD-CAP-CN | ISO 全模型同名被阻止；中文不强制该全局规则 | RULE | ISO 6.2.2、7.3.3 |
| CAP-PROP-006 | AT-CAP-PROP-006 局部命名空间 | TD-CAP-ISO + TD-CAP-CN | ISO 不暴露局部命名空间；中文允许符合路径规则的跨 OPD 重名 | RULE | 中文第 12 章 |
| CAP-PROP-007 | AT-CAP-PROP-007 稳定机器标识 | TD-MULTI-OPD + TD-VERSION | 两配置档跨 OPD、版本和导入保持标识，不替代标准名称 | DATA | 产品追溯需求 |

### 7.2 ISO Procedural Link 与 Control Link

| 能力编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 标准来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-ISO-PROC-001 | AT-CAP-ISO-PROC-001 Consumption | TD-CAP-ISO | 仅 Object -> Process 合法并生成规范 Consumption 语句 | RULE + DATA | ISO 9.1.2 |
| CAP-ISO-PROC-002 | AT-CAP-ISO-PROC-002 Result | TD-CAP-ISO | 仅 Process -> Object 合法并生成规范 Result 语句 | RULE + DATA | ISO 9.1.3 |
| CAP-ISO-PROC-003 | AT-CAP-ISO-PROC-003 Effect | TD-CAP-ISO | Process 与 Object 的双向 Effect 语义、方向和文本一致 | RULE + DATA | ISO 9.1.4 |
| CAP-ISO-PROC-004 | AT-CAP-ISO-PROC-004 Agent | TD-CAP-ISO | 仅合格 Human/Group Object -> Process，生成主体使能语句 | RULE + DATA | ISO 9.2.2 |
| CAP-ISO-PROC-005 | AT-CAP-ISO-PROC-005 Instrument | TD-CAP-ISO | 仅非主体 Object -> Process，不能与 Agent 角色混淆 | RULE + DATA | ISO 9.2.3 |
| CAP-ISO-PROC-006 | AT-CAP-ISO-PROC-006 State Consumption | TD-CAP-ISO | Object State -> Process 合法且 OPL 保留输入状态 | RULE + DATA | ISO 9.3.1 |
| CAP-ISO-PROC-007 | AT-CAP-ISO-PROC-007 State Result | TD-CAP-ISO | Process -> Object State 合法且 OPL 保留生成状态 | RULE + DATA | ISO 9.3.2 |
| CAP-ISO-PROC-008 | AT-CAP-ISO-PROC-008 Input-output Effect | TD-CAP-ISO | 同一 Object 的输入状态经 Process 到输出状态，完整转换可追溯 | RULE + DATA | ISO 9.3.3.2 |
| CAP-ISO-PROC-009 | AT-CAP-ISO-PROC-009 Input Effect | TD-CAP-ISO | 输入状态经 Process 到 Object，OPL 保留已知输入状态 | RULE + DATA | ISO 9.3.3.3 |
| CAP-ISO-PROC-010 | AT-CAP-ISO-PROC-010 Output Effect | TD-CAP-ISO | Object 经 Process 到输出状态，OPL 保留已知输出状态 | RULE + DATA | ISO 9.3.3.4 |
| CAP-ISO-PROC-011 | AT-CAP-ISO-PROC-011 State Agent | TD-CAP-ISO | Agent State -> Process 合法且 OPL 保留主体状态 | RULE + DATA | ISO 9.4.1 |
| CAP-ISO-PROC-012 | AT-CAP-ISO-PROC-012 State Instrument | TD-CAP-ISO | Instrument State -> Process 合法且 OPL 保留手段状态 | RULE + DATA | ISO 9.4.2 |
| CAP-ISO-PROC-013 | AT-CAP-ISO-PROC-013 Invocation | TD-CAP-ISO | Process -> Process 表达完成后调用并生成规范 OPL | RULE + DATA | ISO 9.5.2.5.1 |
| CAP-ISO-PROC-014 | AT-CAP-ISO-PROC-014 Self-invocation | TD-CAP-ISO | Process 可调用自身，递归身份保持且非自调用反例不误判 | RULE + DATA | ISO 9.5.2.5.2 |
| CAP-ISO-PROC-015 | AT-CAP-ISO-PROC-015 Overtime Exception | TD-CAP-ISO | 超时异常只连接合法异常处理 Process，时长语义进入 OPL | RULE + DATA | ISO 9.5.4.2 |
| CAP-ISO-PROC-016 | AT-CAP-ISO-PROC-016 Undertime Exception | TD-CAP-ISO | 低于预期时长异常只连接合法处理 Process，语义进入 OPL | RULE + DATA | ISO 9.5.4.3 |
| CAP-ISO-CTRL-001 | AT-CAP-ISO-CTRL-001 Transforming Event | TD-CAP-ISO | Event 仅修饰 Consumption/Effect，不成为自由连接 | RULE + DATA | ISO 9.5.2.1 |
| CAP-ISO-CTRL-002 | AT-CAP-ISO-CTRL-002 Enabling Event | TD-CAP-ISO | Event 仅修饰 Agent/Instrument，不成为自由连接 | RULE + DATA | ISO 9.5.2.2 |
| CAP-ISO-CTRL-003 | AT-CAP-ISO-CTRL-003 State Transforming Event | TD-CAP-ISO | 仅修饰允许的状态指定 Consumption/Effect 并保留状态 | RULE + DATA | ISO 9.5.2.3 |
| CAP-ISO-CTRL-004 | AT-CAP-ISO-CTRL-004 State Enabling Event | TD-CAP-ISO | 仅修饰状态指定 Agent/Instrument 并保留状态 | RULE + DATA | ISO 9.5.2.4 |
| CAP-ISO-CTRL-005 | AT-CAP-ISO-CTRL-005 Transforming Condition | TD-CAP-ISO | Condition 仅修饰 Consumption/Effect，失败语义符合规则 | RULE + DATA | ISO 9.5.3.1 |
| CAP-ISO-CTRL-006 | AT-CAP-ISO-CTRL-006 Enabling Condition | TD-CAP-ISO | Condition 仅修饰 Agent/Instrument，失败语义符合规则 | RULE + DATA | ISO 9.5.3.2 |
| CAP-ISO-CTRL-007 | AT-CAP-ISO-CTRL-007 State Transforming Condition | TD-CAP-ISO | 仅修饰允许的状态指定转换关系并保留状态和条件 | RULE + DATA | ISO 9.5.3.3 |
| CAP-ISO-CTRL-008 | AT-CAP-ISO-CTRL-008 State Enabling Condition | TD-CAP-ISO | 仅修饰状态指定使能关系并保留状态和条件 | RULE + DATA | ISO 9.5.3.4 |

### 7.3 ISO Structural Link

| 能力编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 标准来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-ISO-STRUCT-001 | AT-CAP-ISO-STRUCT-001 单向有标签 | TD-CAP-ISO | 同类 Thing 间方向和自定义标签保存并生成 OPL | RULE + DATA | ISO 10.2.1 |
| CAP-ISO-STRUCT-002 | AT-CAP-ISO-STRUCT-002 单向空标签 | TD-CAP-ISO | 同类 Thing 间使用标准默认关系语义，不生成虚构标签 | RULE + DATA | ISO 10.2.2 |
| CAP-ISO-STRUCT-003 | AT-CAP-ISO-STRUCT-003 双向有标签 | TD-CAP-ISO | 两个方向语义和对应 OPL 语句均完整 | RULE + DATA | ISO 10.2.3 |
| CAP-ISO-STRUCT-004 | AT-CAP-ISO-STRUCT-004 互惠有标签 | TD-CAP-ISO | 互惠语义不退化为两个无关单向关系 | RULE + DATA | ISO 10.2.4 |
| CAP-ISO-STRUCT-005 | AT-CAP-ISO-STRUCT-005 Aggregation | TD-CAP-ISO | Whole Thing 到 Part Things 合法，整体和组成身份可追溯 | RULE + DATA | ISO 10.3.2 |
| CAP-ISO-STRUCT-006 | AT-CAP-ISO-STRUCT-006 Exhibition | TD-CAP-ISO | Exhibitor 到 Attribute/Operation 合法，并作为跨 Object/Process 类型例外处理 | RULE + DATA | ISO 10.3.3 |
| CAP-ISO-STRUCT-007 | AT-CAP-ISO-STRUCT-007 Generalization | TD-CAP-ISO | General 到 Specialized Things 方向、继承和 OPL 一致 | RULE + DATA | ISO 10.3.4 |
| CAP-ISO-STRUCT-008 | AT-CAP-ISO-STRUCT-008 Classification | TD-CAP-ISO | Class Thing 到 Instance Things 的类实例语义和 OPL 一致 | RULE + DATA | ISO 10.3.5 |
| CAP-ISO-STRUCT-009 | AT-CAP-ISO-STRUCT-009 State Characterization | TD-CAP-ISO | 关系的状态限定在模型、图形和 OPL 中均保留 | RULE + DATA | ISO 10.4.1 |
| CAP-ISO-STRUCT-010 | AT-CAP-ISO-STRUCT-010 State Tagged | TD-CAP-ISO | 源、目标或双端状态、方向和标签全部保留 | RULE + DATA | ISO 10.4.2 |

### 7.4 中文 OPL 草案关系

| 能力编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 标准来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-CN-STATIC-001 | AT-CAP-CN-STATIC-001 表征 | TD-CAP-CN | Thing 到对象/过程特征的端点合法并生成对应 OPT | RULE + DATA | 中文第 9 章“表征” |
| CAP-CN-STATIC-002 | AT-CAP-CN-STATIC-002 描述 | TD-CAP-CN | Value Domain 描述合法事物或特征，方向与 OPT 一致 | RULE + DATA | 中文第 9 章“描述” |
| CAP-CN-STATIC-003 | AT-CAP-CN-STATIC-003 组成 | TD-CAP-CN | Whole 到 Part 保存完备性、未穷举和顺序信息 | RULE + DATA | 中文第 9 章“组成” |
| CAP-CN-STATIC-004 | AT-CAP-CN-STATIC-004 泛化特化 | TD-CAP-CN | 分类方向和继承语义在模型与 OPT 中一致 | RULE + DATA | 中文第 9 章“泛化与特化” |
| CAP-CN-STATIC-005 | AT-CAP-CN-STATIC-005 实例 | TD-CAP-CN | Class/Value Domain 到 Instance/Value 的端点组合正确 | RULE + DATA | 中文第 9 章“实例” |
| CAP-CN-STATIC-006 | AT-CAP-CN-STATIC-006 位置 | TD-CAP-CN | 参考物理事物、被定位事物/过程和位置参数完整保存 | RULE + DATA | 中文第 9 章“位置” |
| CAP-CN-STATIC-007 | AT-CAP-CN-STATIC-007 权属 | TD-CAP-CN | Human/Organization 到资源的所有权或支配语义进入 OPT | RULE + DATA | 中文第 9 章“权属” |
| CAP-CN-DYN-001 | AT-CAP-CN-DYN-001 影响 | TD-CAP-CN | 合法影响端点生成 OPT；Thing -> Thing 简写可追溯展开为显式过程 | RULE + DATA | 中文第 10 章“影响关系组” |
| CAP-CN-DYN-002 | AT-CAP-CN-DYN-002 观测 | TD-CAP-CN | 观测作为影响构造型表达，不错误生成状态改变语义 | RULE + DATA | 中文 10.1.5、10.1.6 |
| CAP-CN-DYN-003 | AT-CAP-CN-DYN-003 消耗 | TD-CAP-CN | 合法事物到 Process 表达消耗或信息删除 | RULE + DATA | 中文 10.1.3 |
| CAP-CN-DYN-004 | AT-CAP-CN-DYN-004 生成 | TD-CAP-CN | Process 到合法事物表达生成且方向正确 | RULE + DATA | 中文 10.1.3 |
| CAP-CN-DYN-005 | AT-CAP-CN-DYN-005 手段 | TD-CAP-CN | 手段到 Process 的使能语义不被误写为消耗 | RULE + DATA | 中文第 10 章“手段关系” |
| CAP-CN-DYN-006 | AT-CAP-CN-DYN-006 主体 | TD-CAP-CN | Human/Organization 到 Process 表达控制或主导 | RULE + DATA | 中文第 10 章“主体关系” |
| CAP-CN-DYN-007 | AT-CAP-CN-DYN-007 激活 | TD-CAP-CN | 前置 Process 结束后触发目标 Process 的语义和 OPT 正确 | RULE + DATA | 中文 10.5.1 |
| CAP-CN-DYN-008 | AT-CAP-CN-DYN-008 去激活 | TD-CAP-CN | 前置 Process 结束后中断运行中目标 Process | RULE + DATA | 中文 10.5.2 |
| CAP-CN-DYN-009 | AT-CAP-CN-DYN-009 激活翻转 | TD-CAP-CN | 目标 Process 运行状态翻转语义不退化为普通激活 | RULE + DATA | 中文 10.5.3 |
| CAP-CN-DYN-010 | AT-CAP-CN-DYN-010 调用 | TD-CAP-CN | Process Instance 到 Process Class 保留参数和返回值 | RULE + DATA | 中文第 10 章“调用关系” |
| CAP-CN-GEN-001 | AT-CAP-CN-GEN-001 单向一般关联 | TD-CAP-CN | 任意合法结点间方向和自定义标签形式化保存 | RULE + DATA | 中文第 11 章 |
| CAP-CN-GEN-002 | AT-CAP-CN-GEN-002 双向一般关联 | TD-CAP-CN | 双向语义和标签完整，不退化为无向装饰线 | RULE + DATA | 中文第 11 章 |
| CAP-CN-GEN-003 | AT-CAP-CN-GEN-003 关联信息 | TD-CAP-CN | Information 可关联两个或更多结点，且不能替代正式关系类型 | RULE + DATA | 中文第 11 章 |
| CAP-CN-GEN-004 | AT-CAP-CN-GEN-004 关联算子 | TD-CAP-CN | Feature/Value Domain 经 Process 表达定量或逻辑关联 | RULE + DATA | 中文第 11 章“关联算子” |
| CAP-CN-GEN-005 | AT-CAP-CN-GEN-005 主体版型 | TD-CAP-CN | 已支持的受控版型可验证；未实现时能力报告明确且不开放任意版型 | RULE + DATA | 中文第 10 章“主体的版型” |
| CAP-CN-GEN-006 | AT-CAP-CN-GEN-006 导入关系 | TD-CAP-CN | 已支持时保留来源身份、版本和可见性；未实现时能力报告明确 | INT + DATA | 中文第 12 章“导入” |

### 7.5 修饰机制

| 能力编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 标准来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-MOD-001 | AT-CAP-MOD-001 多重性 | TD-CAP-ISO + TD-CAP-CN | 两配置档分别校验适用端点、默认值和表达式并生成文本 | RULE + DATA | ISO 11；中文第 8、9 章 |
| CAP-MOD-002 | AT-CAP-MOD-002 路径标签 | TD-CAP-ISO + TD-CAP-CN | 输入输出路径成对且能消除执行歧义，缺失或冲突被检出 | RULE + DATA | ISO 13；中文 10.1.4 |
| CAP-MOD-003 | AT-CAP-MOD-003 Event | TD-CAP-ISO + TD-CAP-CN | Event 只修饰各配置档允许的动态关系，非法组合被阻止 | RULE + DATA | ISO 9.5.2；中文 10.7 |
| CAP-MOD-004 | AT-CAP-MOD-004 Condition | TD-CAP-ISO + TD-CAP-CN | Condition 合法组合保存，失败时 wait/skip 差异进入文本和规则 | RULE + DATA | ISO 9.5.3；中文 10.7.5 |
| CAP-MOD-005 | AT-CAP-MOD-005 Stop Event | TD-CAP-ISO + TD-CAP-CN | ISO 不暴露独立类型并以标准机制派生；中文 `-e` 原生可用 | RULE + DATA | ISO 9.5；中文 10.7.2、10.7.6 |
| CAP-MOD-006 | AT-CAP-MOD-006 非必要条件 | TD-CAP-ISO + TD-CAP-CN | ISO 创建、导入和转换均阻止 `un`；中文可生成对应 OPT | RULE + DATA | 中文“过程条件的必要性” |
| CAP-MOD-007 | AT-CAP-MOD-007 AND/XOR/OR | TD-CAP-ISO + TD-CAP-CN | 两配置档正确保存三种逻辑，端点分组和文本一致 | RULE + DATA | ISO 12；中文第 12 章 |
| CAP-MOD-008 | AT-CAP-MOD-008 完整布尔 | TD-CAP-ISO + TD-CAP-CN | ISO 阻止非三种逻辑；中文完整表达可用，转换仅在证明等价时通过 | RULE + DATA | 中文第 12 章 |
| CAP-MOD-009 | AT-CAP-MOD-009 概率 | TD-CAP-ISO + TD-CAP-CN | 概率扇出和总和规则正确，非法概率被定位 | RULE + DATA | ISO 12.7；中文“随机过程和概率” |
| CAP-MOD-010 | AT-CAP-MOD-010 状态指定关系 | TD-CAP-ISO + TD-CAP-CN | ISO 直接连接 Object State；中文以值域/值派生且语义可追溯 | RULE + DATA | ISO 9.3、9.4、10.4；中文第 7、8 章 |
| CAP-MOD-011 | AT-CAP-MOD-011 关系细化 | TD-CAP-ISO + TD-CAP-CN | 中文原生关系细化保存上下层追溯；ISO 不暴露同名类型并保持事实一致 | RULE + DATA | ISO 14.2；中文第 12 章 |

### 7.6 上下文与模型能力

| 能力编号 | 验收用例 | 测试数据 | 预期结果 | 验证方式 | 标准来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-CTX-001 | AT-CAP-CTX-001 process tree | TD-ISO-BASE + TD-CN-BASE | ISO 以 SD 为唯一根；中文通过其 OPD 细化规则派生上下文结构 | RULE + DATA | ISO 14.1、14.2.2.6.1；中文第 12 章 |
| CAP-CTX-002 | AT-CAP-CTX-002 object forest | TD-MULTI-OPD | ISO 多个对象根分别成树；中文派生表示且不混入 process tree | RULE + DATA | ISO 14.2.2.6.1；中文第 12 章 |
| CAP-CTX-003 | AT-CAP-CTX-003 System map | TD-ISO-BASE + TD-CN-BASE | ISO 必须完整导航；中文未实现时能力报告明确，已实现时按声明验证 | E2E + DATA | ISO 14.2.2.6.1.5 |
| CAP-CTX-004 | AT-CAP-CTX-004 Model view | TD-MULTI-OPD + TD-CN-BASE | ISO 已支持时保存条件、事实与 OPL；中文禁止作为草案原生 OPD | RULE + DATA | ISO 14.2.2.6.1.5；中文第 12 章 |
| CAP-CTX-005 | AT-CAP-CTX-005 状态显式抑制 | TD-ISO-BASE + TD-CN-BASE | ISO 原生操作更新上下文和 OPL；中文以值域/值机制派生 | E2E + DATA | ISO 14.2.1.1；中文草案 |
| CAP-CTX-006 | AT-CAP-CTX-006 展开折叠 | TD-ISO-BASE + TD-CN-BASE | 两配置档操作前后事实身份稳定，上下文和文本按规则变化 | E2E + DATA | ISO 14.2.1.2；中文第 12 章 |
| CAP-CTX-007 | AT-CAP-CTX-007 内缩放外缩放 | TD-ISO-BASE + TD-CN-BASE | 两配置档执行语义缩放并更新文本，与视口缩放严格分离 | E2E + DATA | ISO 14.2.1.3；中文第 9、12 章 |
| CAP-CTX-008 | AT-CAP-CTX-008 OPD 局部命名空间 | TD-CAP-ISO + TD-CAP-CN | ISO 阻止局部重名放宽；中文按路径解析局部同名结点 | RULE + DATA | ISO 7.3.3；中文第 12 章 |
| CAP-CTX-009 | AT-CAP-CTX-009 可见性 | TD-CAP-ISO + TD-CAP-CN | ISO 不暴露公开/保护/私有；中文引用严格遵守可见性 | RULE + DATA | 中文第 12 章 |
| CAP-CTX-010 | AT-CAP-CTX-010 模型库导入 | TD-CAP-ISO + TD-CAP-CN | 已支持时来源、版本、身份和可见性完整；未实现时两配置档能力报告明确 | INT + DATA | 中文第 12 章 |

## 8. 跨配置档专项用例

| 用例编号 | 场景 | 测试数据 | 预期结果 | 关联需求 |
| --- | --- | --- | --- | --- |
| AT-CROSS-001 | 中文草案模型转换为 ISO | TD-CROSS | 每项能力得到无损、扩展、有损或无法映射结论；源模型不变 | FR-PROJ-005、FR-IO-006、FR-VAL-004 |
| AT-CROSS-002 | 禁止能力直接导入 ISO | TD-CROSS | Value Domain、Value、Flow、Process State、局部重名、完整布尔和 `un` 等不被静默接受 | FR-META-011、能力矩阵第 9 章 |
| AT-CROSS-003 | 可映射结构关系 | 位置、权属、一般性关联样例 | 仅在语义和标签可保持时映射；结果保留中文扩展来源，不标为 ISO 原生 | FR-META-008、主需求 11.5 |
| AT-CROSS-004 | 配置档升级 | 同一模型与新旧规则版本 | 先产生影响和迁移报告；未确认不改模型，已发布基线不被重写 | FR-PROJ-005、NFR-MAINT-004 |

## 9. 追踪完整性规则

1. 主需求新增、删除或重编号任一 `FR-*`、`NFR-*` 时，必须在同一变更中更新本矩阵。
2. 能力矩阵新增、删除、改状态或重编号任一 `CAP-*` 时，必须同步更新能力用例和跨配置档用例。
3. 一个编号在本矩阵只能有一个主追踪行；补充场景通过附加用例引用，不复制主追踪行。
4. 本矩阵的“标准来源”逐步链接到 `ISOR-*` 内部规则组；原子规则形成后继续链接到条款测试，不复制第二套标准规则内容。
5. 用例实际执行后，在独立测试报告记录证据，不把动态执行结果回写为需求事实。

## 10. 冻结延期与执行边界

- 浏览器矩阵和 NFR-PERF-001~004 的阈值已冻结；执行证据由对应跨浏览器、DEV-CANVAS-06 和 release 报告形成；
- `FR-IO-007` 外部工具交换、`FR-ASSET-006` 本体映射与发布为 `FROZEN_DEFERRED`，不得在当前发布中伪装支持；
- 96 项能力和 103 个 ISO 规则组的设计入口已冻结；原子规则、完整 Annex A Grammar、完整 Clause 4 Symbol Catalog 和符合性声明为 `FROZEN_DEFERRED`；
- 三份逻辑字段设计和当前机器 Schema 是开发输入；Revision 0.2、完整 Profile/Rule/Grammar/Symbol 包、代表模型和破损包属于待实现/待执行证据；
- P01-P06 原型验收已完成，当前全局设计门为 `READY_FOR_DEVELOPMENT`；单个用例仍保持 `NOT_RUN`，直到在 exact build、fixture 和环境上保存证据。
