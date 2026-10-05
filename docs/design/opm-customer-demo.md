# OPM 客户演示案例设计：仓储订单履约

状态：案例设计完成基线。尚未在工作台绘制、保存或执行端到端验证；H1 和多级 OPD 可用性仍按本文的实施前检查处理。

## 1. 标准依据与案例定位

`reference/ISO+19450-2024.pdf` 附录 C.6（PDF 第 148 页起，图 C.22、C.23 等）有连续的 Process Performance Controlling 示例，展示 SD、逐层细化、输入/输出对象集合、过程状态、条件及成功/失败消息。它是抽象过程控制案例，并非仓储行业案例。`reference/自动化系统与集成 对象过程语言-20250914.pdf` 附录 A 有基础本体、信息、角色的概念模型示例；`reference/基于OPL的架构建模方法20260425.pdf` 第 8 章有 6×1 模型结构框架。后两份 PDF 的封面/页眉标为 `GB/T XXXXX—XXXX`，属于草案。

本设计用仓储履约建立客户可理解的业务主模型，再用同项目的独立工具校验模型覆盖工具栏。仓储事实、名称及场景是本设计自拟；标准仅提供建模语义和组织方法。这里的“正确”指与当前 Profile、候选、OPL 投影及持久化契约一致，不等于 ISO 符合性认证或仓储业务规则验证。

## 2. 目标、边界和讲述顺序

**客户问题**：一张出库订单如何从待履约走向已完成？哪些对象被消耗或生成，谁负责执行，设备如何支持，包裹复核失败时如何表达异常？

**系统边界**：从出库订单已受理到包裹复核及异常记录。包含拣选、打包、复核、异常处置的概念关系；不含支付、库存扣账算法、承运配送、真实设备控制和时序仿真。图上的过程排列不代表运行时执行顺序，关系工具只创建模型 Fact。

**6×1 检查**：客体是订单和包裹；主体是仓储作业员；手段是分拣设备；资源是包装材料；信息是出库订单与复核记录；所关注过程是订单履约。环境事物可用“仓库作业环境”占位，但当前场景不为其虚构未获支持的环境影响关系。缺失的环境约束记录为建模问题，而非已验证事实。

**演示假设 H1**：只有取得“通过复核记录”，才允许完单登记把出库订单从待履约变为已完成。这是本案例自拟的业务规则，实施前须由业务方确认。

**成功叙事**：订单进入待履约状态；作业员与设备支持拣选；打包消耗包装材料并生成待检包裹；复核把包裹从待检变为合格并生成通过复核记录；满足 H1 后完单登记将订单变为已完成。**异常叙事**：复核发现不合格或过程超时，进入异常处置，形成异常记录；不把“异常已处理”推断为实际仓储系统发生了处置。

## 3. 模型包与 OPD 分层

一个独立演示项目内放一个客户模型和四个工具校验模型。`仓储订单履约-客户演示` 仅保留业务上可解释的关系；`仓储订单履约-工具校验-PROC`、`仓储订单履约-工具校验-CTRL`、`仓储订单履约-工具校验-STRUCT`、`仓储订单履约-工具校验-NEG` 分别验证过程关系、控制关系、结构关系和拒绝路径。五个模型的元素身份彼此独立，不跨模型引用。工具校验模型中的自调用、欠时异常、无标签关联等是语言能力样例，不宣称它们是本客户的实际业务流程。

| 模型/图 | 关注点 | 主要元素 | 边界 |
| --- | --- | --- | --- |
| 客户 SD | 系统目的与外部角色 | 订单履约过程、出库订单、包裹、作业员、分拣设备 | 控制在约 5 个主节点；避免把全部工具堆在根图。 |
| 客户 SD1：订单履约细化 | 履约内部构造 | 拣选、打包、复核、完单登记、异常处置；包装材料、包裹、通过复核记录 | 从根图的“订单履约”创建子 OPD；子过程各有独立身份。 |
| 客户 SD1.1：异常处置细化 | 不合格与超时路径 | 异常确认、人工复核、从 SD1 引用异常记录 | 仅在多级细化实际可用时创建；不以同名新过程冒充已细化节点。 |
| 工具校验模型根图 | 单一工具族验证 | PROC、CTRL、STRUCT 或 NEG 的专用数据集 | 每个模型只承载一类测试；CTRL 的 8 组基础 Fact 使用带 `C01` 至 `C08` 前缀的独立元素，NEG 每条用例从对应正例的空白副本开始。 |

开始建模前须在当前运行版本确认多级 OPD、跨图引用和子图所有权的候选行为。若 SD1.1 尚不可用，省略该层，保留 SD1 的完整异常主路径；另在工具校验模型中记录多级导航阻断，不在根图叠画，也不声称多级导航通过。

## 4. 元素与状态字典

名称是演示概念名，不是预置的模型 ID。事实关系须使用工作台返回的目标身份与候选，不靠同名字符串拼接。

| 代号 | 类型 | 建议所属图 | 语义与约束 |
| --- | --- | --- | --- |
| O1 出库订单 | Object/信息 | SD，按需在 SD1 引用 | 已受理的履约输入；状态：待履约、已完成、异常。 |
| O2 包裹 | Object/客体 | SD，按需在 SD1 引用 | 打包的产物；状态：待检、合格、不合格。三者是同一对象的备选状态；案例不声明某一时刻的实际活动状态。 |
| O3 包装材料 | Object/资源 | SD1 | 打包时消耗；另设可用状态用于状态指定消耗校验。 |
| O4 仓储作业员 | Object/主体 | SD，按需在 SD1 引用 | 支持拣选或打包；在岗状态用于状态指定主体关系。 |
| O5 分拣设备 | Object/手段 | SD，按需在 SD1 引用 | 支持拣选；可用状态用于状态指定手段关系。 |
| O6 通过复核记录 | Object/信息 | SD1 | 成功分支由复核生成，按 H1 使能完单登记；不把它当成复核过程本身。 |
| O7 异常记录 | Object/信息 | SD1，按需在 SD1.1 引用 | 异常处置生成的记录；即使不创建 SD1.1，也能在 SD1 完成异常主路径。 |
| P1 订单履约 | Process | SD | 系统性过程，可细化。 |
| P2 拣选 | Process | SD1 | 从订单确定待处理物品；不在本 demo 中执行库存扣减。 |
| P3 打包 | Process | SD1 | 消耗包装材料，生成包裹。 |
| P4 复核 | Process | SD1 | 对包裹作状态影响并生成复核记录。 |
| P5 异常处置 | Process | SD1 | 处理不合格或超时的概念路径，可细化。 |
| P6 完单登记 | Process | SD1 | 在通过复核记录存在时，记录订单完成。 |
| F1 包裹重量 | Attribute，归属 O2 | SD1 | 展示对象特征及特征值状态。 |
| F2 复核时长 | Attribute，归属 P4 | SD1 | 展示过程特征；仅用于建模，不自动计时。 |
| F3 设备自检 | Operation，归属 O5 | 工具校验图 | 展示 Operation 归属，不与 P4 复核混同。 |

状态角色（初始/最终）应按当前候选允许值设置：O1 的“待履约”、O2 的“待检”可作为初始状态候选；“已完成”“合格”可作为最终状态候选。若运行时不提供相应角色，保留状态名并记录差异，不在设计阶段认定已保存该角色。演示只描述可能的状态变化，不模拟状态机实际运行。

## 5. 客户主模型的关系清单

每条关系单独提交。`CAP-ISO-*` 是当前工具能力 ID；控制关系须附着于已存在的相容过程 Fact，不能画成自由漂浮的线。OPL 栏记录必须表达的语义，不预设中文名称组合后的逐字英文语序；逐字结果以实际运行时投影为准。

| 验收 ID | 所属图 | 工具 | 输入端点与业务解释 | 预期语义/检查点 |
| --- | --- | --- | --- | --- |
| M-01 | SD1 | `PROC-005` 手段 | O1 出库订单 -> P2 拣选 | 拣选需要订单信息；订单不被消耗。 |
| M-02 | SD1 | `PROC-004` 主体 | O4 仓储作业员 -> P2 拣选 | 作业员负责/支持拣选；不可反向当结果。 |
| M-03 | SD1 | `PROC-005` 手段 | O5 分拣设备 -> P2 拣选 | 分拣设备作为非人手段；可用状态变体放在工具模型。 |
| M-04 | SD1 | `PROC-001` 消耗 | O3 包装材料 -> P3 打包 | 包装材料是被消耗对象。 |
| M-05 | SD1 | `PROC-002` 生成 | P3 打包 -> O2 包裹 | 包裹由打包生成，与 M-04 是两个 Fact。 |
| M-06 | SD1 | `PROC-008` 状态影响 | O2 待检 -> P4 复核 -> O2 合格 | 输入/输出状态归属于同一包裹；这是成功分支。 |
| M-07 | SD1 | `PROC-002` 生成 | P4 复核 -> O6 通过复核记录 | 成功分支生成记录；该关系本身不执行复核判定。 |
| M-08 | SD1 | `STRUCT-006` 特征 | O2 包裹 -> F1 包裹重量 | 特征归属包裹；Feature Value State 在工具模型验证。 |
| M-09 | SD | `STRUCT-001` 单向标记 | O1 出库订单 -> O2 包裹，标签“对应” | 标签必须保存，语义仅为关联，不替代订单履约状态转换。 |
| M-10 | SD1 | `PROC-015` 超时异常 | P3 打包 -> P5 异常处置，时长 `PT5M` | 表达超时异常分支；五分钟仅为演示阈值，无业务 SLA 效力。 |
| M-11 | SD1 | `PROC-002` 生成 | P5 异常处置 -> O7 异常记录 | 异常记录产生后仍需人工判定是否完成处置。 |
| M-12 | SD1 | `PROC-005` + `CTRL-006` | O6 通过复核记录 -> P6 完单登记，并对该手段 Fact 附加使能条件 | O6 不存在时完单登记应被跳过；控制属于 M-12 的基础 Fact。 |
| M-13 | SD1 | `PROC-008` 状态影响 | O1 待履约 -> P6 完单登记 -> O1 已完成 | 状态归属同一订单；这是演示假设 H1 的完单效果。 |
| M-14 | SD1 | `PROC-008` 状态影响 | O2 待检 -> P4 复核 -> O2 不合格 | 输入/输出状态归属于同一包裹；这是失败分支，不生成 O6。 |
| M-15 | SD1 | `PROC-012` + `CTRL-008` | O2 不合格 -> P5 异常处置，并对该状态指定手段 Fact 附加使能条件 | 存在不合格包裹时进入异常处置，否则跳过；控制属于 M-15 的基础 Fact。 |

M-06 单独不推出“订单已完成”；只有 M-07、M-12、M-13 构成 H1 所定义的成功路径。M-14、M-15、M-11 构成复核不合格路径，M-10、M-11 构成超时路径。若业务方不接受 H1，撤销 M-12/M-13 并将订单完成条件列为待确认项。时间异常的端点和时长要由候选确认；若该能力被 Profile 禁用，则 M-10 移至 PROC 工具校验模型，客户主模型保留不合格异常路径。SD1.1 只细化 P5 的内部步骤，不承担上述主路径 Fact；多级 OPD 不可用时不影响 SD1 的 15 条关系。

## 6. 工具校验模型：34 类关系

正例按工具族在独立模型中创建。下表中的“拒绝例”统一在 `仓储订单履约-工具校验-NEG` 的独立 `Nxx` 数据分区执行，不应成为已提交模型内容。每项至少核对：候选是否出现、Fact 能否提交、符号方向/标签、OPL 与 trace、保存重开。Oracle 栏给出的 Golden case 是模板、句子、符号和错误码的精确判据；本案例实测仍须使用案例自己的元素身份，不能把既有 Golden 结果当作本案例通过。

### 6.0 校验数据集与隔离规则

| 模型 | 初始数据与分区 | 提交规则 |
| --- | --- | --- |
| `仓储订单履约-工具校验-PROC` | 根图放一套下表 T 元素；16 个过程正例使用独立 Fact。 | 只提交正例；同一对象的输入/输出状态必须同 owner。 |
| `仓储订单履约-工具校验-CTRL` | 根图放 `C01` 至 `C08` 八组下表 T 元素副本；每组只建一个基础过程 Fact。 | 每个控制只更新对应基础 Fact；事件与条件不得叠加在同一 Fact。 |
| `仓储订单履约-工具校验-STRUCT` | 根图放一套结构专用 T 元素；fan 成员按表中顺序编号。 | 完整/不完整、方向和标签作为显式参数提交。 |
| `仓储订单履约-工具校验-NEG` | 每个 BLOCKED case 使用带 `Nxx` 前缀的独立元素；需要基础 Fact 的控制负例各自预建一个基础 Fact。 | 记录提交前 token 和 Fact 集；拒绝后两者必须不变。不同负例不共享基础 Fact。 |

| 代号 | 类型、状态或归属 | 使用范围 |
| --- | --- | --- |
| T-O1 出库订单 | Object；状态：待履约、已完成、异常 | PROC、STRUCT-010 |
| T-O2 包裹 | Object；状态：待检、合格、不合格 | PROC-003/007/008/009/010、CTRL-005/007、STRUCT-001/009/010 |
| T-O3 包装材料 | Object；状态：可用 | PROC-001/006、CTRL-001/003 |
| T-O4 仓储作业员 | Object；状态：在岗 | PROC-004/011、CTRL-002/004 |
| T-O5 分拣设备 | Object；状态：可用；Operation：设备自检 | PROC-005/012、CTRL-006/008、STRUCT-003/006/007 |
| T-O6 拣货单 | Object | STRUCT-002 |
| T-O7 履约系统 | Object | STRUCT-003/005 |
| T-O8 分拣单元、T-O9 打包单元 | Object | STRUCT-005 的两个有序成员 |
| T-O10 仓储设备 A、T-O11 仓储设备 B | Object | STRUCT-004 |
| T-O12 自动分拣机、T-O13 人工拣选台 | Object | STRUCT-007 的特化项 |
| T-O14 自动分拣机 A | Object | STRUCT-008 的实例 |
| T-P1 拣选、T-P2 打包、T-P3 复核、T-P4 异常处置 | Process | 通用过程关系与控制基础 Fact |
| T-P5 打包执行、T-P6 复核流程模板 | Process | PROC-013 |
| T-P7 重试检查、T-P8 欠时检查 | Process | PROC-014/016 |
| T-F1 包裹重量 | Attribute，归属 T-O2；Feature Value State：超重 | STRUCT-006/009 |
| T-F2 复核时长 | Attribute，归属 T-P3 | STRUCT-006 的 Process/Attribute 覆盖 |
| T-F3 设备自检 | Operation，归属 T-O5 | STRUCT-006 的 Object/Operation 覆盖 |

Feature Value State 的 Runtime 候选和提交契约已存在，但当前工作台状态按钮只允许 Object State。实施 `STRUCT-009` 时先把“超重”记录为工具缺口，再由自动化夹具调用草稿候选和命令 API 预置 T-F1 的值状态；客户现场不演示这一隐藏步骤，也不宣称工作台已支持手工创建 Feature Value State。

### 6.1 过程关系（16 类）

| ID | 同域正例 | PASS Oracle | 拒绝 Oracle / 预期错误 |
| --- | --- | --- | --- |
| `PROC-001` | 包装材料 -> 打包，消耗 | `G-OPL-PROC-001.CONSUMPTION_OBJECT.PASS` | `G-OPL-PROC-001.ENDPOINTS_REVERSED.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-002` | 打包 -> 包裹，生成 | `G-OPL-PROC-002.RESULT_OBJECT.PASS` | `G-OPL-PROC-002.ENDPOINTS_REVERSED.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-003` | 包裹 -> 复核 -> 同一包裹，影响 | `G-OPL-PROC-003.EFFECT_OBJECT.PASS` | `G-OPL-PROC-003.ENDPOINTS_REVERSED.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-004` | 作业员 -> 拣选，主体 | `G-OPL-PROC-004.AGENT_OBJECT.PASS` | `G-OPL-PROC-004.ENDPOINTS_REVERSED.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-005` | 分拣设备 -> 拣选，手段 | `G-OPL-PROC-005.INSTRUMENT_OBJECT.PASS` | `G-OPL-PROC-005.ENDPOINTS_REVERSED.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-006` | 可用包装材料 -> 打包，状态指定消耗 | `G-OPL-PROC-006.CONSUMPTION_STATE.PASS` | `G-OPL-PROC-006.STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-007` | 打包 -> 待检包裹，状态指定生成 | `G-OPL-PROC-007.RESULT_STATE.PASS` | `G-OPL-PROC-007.STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-008` | 待检包裹 -> 复核 -> 合格包裹 | `G-OPL-PROC-008.EFFECT_INPUT_OUTPUT_STATE.PASS` | `G-OPL-PROC-008.INPUT_STATE_OWNER_MISMATCH.BLOCKED`、`G-OPL-PROC-008.OUTPUT_STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-009` | 待检包裹 -> 复核 -> 包裹 | `G-OPL-PROC-009.EFFECT_INPUT_STATE.PASS` | `G-OPL-PROC-009.INPUT_STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-010` | 包裹 -> 复核 -> 合格包裹 | `G-OPL-PROC-010.EFFECT_OUTPUT_STATE.PASS` | `G-OPL-PROC-010.OUTPUT_STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-011` | 在岗作业员 -> 拣选，状态指定主体 | `G-OPL-PROC-011.AGENT_STATE.PASS` | `G-OPL-PROC-011.STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-012` | 可用分拣设备 -> 拣选，状态指定手段 | `G-OPL-PROC-012.INSTRUMENT_STATE.PASS` | `G-OPL-PROC-012.STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `PROC-013` | 打包执行 -> 复核流程模板，调用 | `G-OPL-PROC-013.INVOCATION_PROCESS.PASS` | `G-OPL-PROC-013.TARGET_KIND_INVALID.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-014` | 重试检查 -> 自身，自调用 | `G-OPL-PROC-014.SELF_INVOCATION_SAME_PROCESS.PASS` | `G-OPL-PROC-014.SELF_IDENTITY_MISMATCH.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `PROC-015` | 打包 -> 异常处置，超时 `PT5M` | `G-OPL-PROC-015.OVERTIME_DURATION.PASS` | `G-OPL-PROC-015.DURATION_MISSING.BLOCKED` / `INVALID_ARGUMENT` |
| `PROC-016` | 复核 -> 欠时检查，欠时 `PT1M` | `G-OPL-PROC-016.UNDERTIME_DURATION.PASS` | `G-OPL-PROC-016.DURATION_MISSING.BLOCKED` / `INVALID_ARGUMENT` |

### 6.2 控制关系（8 类）

先分别创建基础过程 Fact，再选中该 Fact 的 OPL/关系，查询控制候选。每个控制例用独立副本，避免同一基础 Fact 上事件/条件组合互斥。这里不把控制工具描述成单独的 Object->Process 连线。

| ID | 基础 Fact + 控制输入 | PASS Oracle | 重点拒绝/观察 |
| --- | --- | --- | --- |
| `CTRL-001` | C01 包装材料消耗 Fact + 转换事件 | `G-OPL-CTRL-001.CONSUMPTION.PASS` | 不兼容结果 Fact 时不得出现候选。 |
| `CTRL-002` | C02 作业员主体 Fact + 使能事件 | `G-OPL-CTRL-002.AGENT.PASS` | 必须先选主体 Fact。 |
| `CTRL-003` | C03 可用包装材料状态消耗 Fact + 状态指定转换事件 | `G-OPL-CTRL-003.CONSUMPTION_STATE.PASS` | 状态来自基础 Fact，不新造孤立状态。 |
| `CTRL-004` | C04 在岗作业员状态主体 Fact + 状态指定使能事件 | `G-OPL-CTRL-004.AGENT_STATE.PASS` | 状态 owner 与基础 Fact 一致。 |
| `CTRL-005` | C05 包裹影响自身 Fact + 转换条件 | `G-OPL-CTRL-005.EFFECT.PASS` | 观察条件句式与跳过分支。 |
| `CTRL-006` | C06 分拣设备手段 Fact + 使能条件 | `G-OPL-CTRL-006.INSTRUMENT.PASS` | 不把条件误记为过程结果。 |
| `CTRL-007` | C07 待检到合格的输入输出状态影响 Fact + 状态指定转换条件 | `G-OPL-CTRL-007.EFFECT_INPUT_OUTPUT.PASS` | 状态应位于输入段。 |
| `CTRL-008` | C08 可用分拣设备状态手段 Fact + 状态指定使能条件 | `G-OPL-CTRL-008.INSTRUMENT_STATE.PASS` | 结果/输出段不匹配时不得出现候选。 |

控制关系共用拒绝判据：独立创建 Control Fact 使用 `G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED`，同一基础 Fact 叠加事件与条件使用 `G-OPL-CTRL-001.EVENT_CONDITION_COMBINATION.BLOCKED`，两者预期均为 `MODIFIER_COMBINATION_INVALID`。其他不相容基础 Fact 首先应在候选层被过滤；若绕过候选提交，也必须以同一错误码拒绝且不改变 token 与 Fact 集。

### 6.3 结构关系（10 类）

| ID | 同域正例 | PASS Oracle | 拒绝 Oracle / 预期错误 |
| --- | --- | --- | --- |
| `STRUCT-001` | 出库订单 -> 包裹，标签“对应” | `G-OPL-STRUCT-001.UNIDIRECTIONAL_OBJECT_TAGGED.PASS` | `G-OPL-STRUCT-001.FORWARD_TAG_MISSING.BLOCKED` / `MODIFIER_COMBINATION_INVALID` |
| `STRUCT-002` | 出库订单 -> 拣货单，无标签 | `G-OPL-STRUCT-002.UNIDIRECTIONAL_OBJECT_NULL_TAG.PASS` | `G-OPL-STRUCT-001.CROSS_KIND_TAGGED.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-003` | 履约系统 <-> 分拣设备，正向“使用”、反向“属于” | `G-OPL-STRUCT-003.BIDIRECTIONAL_OBJECT_TAGGED.PASS` | `G-OPL-STRUCT-003.REVERSE_TAG_MISSING.BLOCKED` / `MODIFIER_COMBINATION_INVALID` |
| `STRUCT-004` | 仓储设备 A、B 互惠“协同” | `G-OPL-STRUCT-004.RECIPROCAL_OBJECT_TAGGED.PASS` | `G-OPL-STRUCT-004.CROSS_KIND_RECIPROCAL.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-005` | 履约系统由分拣单元、打包单元组成，分别提交完整和不完整 fan | `G-OPL-STRUCT-005.AGGREGATION_OBJECT_FAN_2_COMPLETE.PASS`、`G-OPL-STRUCT-005.AGGREGATION_OBJECT_FAN_2_INCOMPLETE.PASS` | `G-OPL-STRUCT-005.FAN_ORDINAL_DUPLICATE.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-006` | 包裹展示包裹重量；分拣设备展示设备自检；复核展示复核时长 | `G-OPL-STRUCT-006.CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_1_COMPLETE.PASS`、`...OBJECT_OPERATOR...`、`...PROCESS_ATTRIBUTE...` | `G-OPL-STRUCT-006.FEATURE_KIND_INVALID.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-007` | 分拣设备泛化自动分拣机、人工拣选台，完整 fan | `G-OPL-STRUCT-007.GENERALIZATION_OBJECT_FAN_2_COMPLETE.PASS` | `G-OPL-STRUCT-007.MULTIPLE_REFINEABLE.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |
| `STRUCT-008` | 自动分拣机 -> 自动分拣机 A，分类实例 | `G-OPL-STRUCT-008.CLASSIFICATION_OBJECT_FAN_1.PASS` | `G-OPL-STRUCT-008.COMPLETENESS_INVALID.BLOCKED` / `MODIFIER_COMBINATION_INVALID` |
| `STRUCT-009` | 包裹展示“超重”的包裹重量值状态 | `G-OPL-STRUCT-009.CHARACTERIZATION_OBJECT_VALUE_STATE.PASS` | `G-OPL-STRUCT-009.STATE_OWNER_MISMATCH.BLOCKED` / `STATE_OWNER_MISMATCH` |
| `STRUCT-010` | 待检包裹 -> 待履约出库订单，标签“对应” | `G-OPL-STRUCT-010.UNIDIRECTIONAL_BOTH_STATE_TAGGED.PASS` | `G-OPL-STRUCT-010.PROCESS_ENDPOINT_INVALID.BLOCKED` / `ENDPOINT_KIND_MISMATCH` |

`STRUCT-006` 省略段分别补为 `G-OPL-STRUCT-006.CHARACTERIZATION_OBJECT_OPERATOR_FAN_1_COMPLETE.PASS` 和 `G-OPL-STRUCT-006.CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_1_COMPLETE.PASS`。每个 PASS 必须比较 Golden manifest 中的 `expected_normalized_fact`、`expected_projection`、`expected_sentences` 和 trace 来源；不能只检查页面出现一条线。

## 7. 非关系工具与操作闭环

| 验收 ID | 操作 | 可观察结果与失败判据 |
| --- | --- | --- |
| W-01 | 新建独立项目、一个客户模型和 PROC/CTRL/STRUCT/NEG 四个工具模型 | 项目/模型各有独立身份；打开任一模型进入自己的根 Context，不出现跨模型元素。 |
| W-02 | Object/Process 创建、改名；Attribute/Operation 归属；Object State 创建 | 名称、归属、状态在保存重开后保持；错误 owner 不提交。Feature Value State 按 6.0 节记录为 UI 缺口并由自动化夹具预置。 |
| W-03 | State 显式/抑制、折叠/展开 | 仅改变呈现，不删除语义 State；再次展开仍可定位。 |
| W-04 | 根图进入子 OPD、返回、再次打开 | 导航路径和父子所有权稳定；不能用同名节点伪装细化。 |
| W-05 | 关系候选、内联参数、取消和提交 | 取消零提交；提交后 Fact、符号、OPL/trace 指向同一语义。 |
| W-06 | 选择、属性检查器、节点布局、缩放、平移 | 改布局后重开位置稳定；仅缩放/平移不改语义。 |
| W-07 | OPL 句子定位；运行校验；问题页和操作历史 | 句子定位到对应 Fact；校验后 Finding 可定位且历史记录本次操作。Finding 是建模诊断，不代表业务批准。 |
| W-08 | 手动保存、刷新、固定版本、永久链接 | 内容重开一致；固定版本只读，返回活动草稿可继续编辑。 |
| W-09 | 删除一个独立测试 Fact，再执行含依赖删除的候选 | 只删除候选授权的构造；依赖阻断/级联预览清楚且无意外删除。 |
| W-10 | 非法端点、错误 State owner、缺标签/时长、旧候选 | 给出错误并保持草稿编辑序号与已提交 Fact 集合不变。 |

当前底部“架构方法”页只显示待连接提示，不能作为自动方法检查演示；原生交换代码没有已确认的工作台用户入口，仿真/真实执行也不在当前可验证范围。这三项只列缺口，不计入覆盖率。

## 8. 演示与验收协议

1. **预检**：确认运行时 Profile 版本、34 类目录项启用状态、OPD 细化层级、专用空白存储根、五个模型名称和 NEG 数据分区。记录不可用项；不为了演示绕过候选。
2. **客户讲解（约 15 分钟）**：按 SD -> SD1 -> M-04/M-05 -> 包裹状态/M-06 -> OPL/trace -> 异常路径讲述。每个关键关系先说明业务语义，再操作工具并观察结果。
3. **正确性抽检（约 15 分钟）**：选取 3 类过程、2 类控制、3 类结构正例，加 W-03/04/06/08/10。控制先建基础 Fact，结构 fan 单独验证完整性。非法输入必须零提交。
4. **全量回归（非现场）**：按第 6 节 34 类逐项执行；与现有 `packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-coverage-catalog.json` 的 PASS/BLOCKED 资产对照，保存 demo case ID、Golden case ID、Profile binding、输入身份、候选 option、提交响应、normalized Fact、symbol projection、OPL/trace、保存重开结果。`STRUCT-009` 另存 Feature Value State 的 API 预置记录和 UI 缺口，不计为工作台手工创建通过。既有资产不能替代本案例实测。
5. **判定**：某项仅在候选、提交/拒绝、投影、保存重开四层证据均符合预期时记为“通过”。“未运行”“工具禁用”“标准语义争议”“产品缺陷”分别记录，不能合并写成通过。客户口头认可也不替代技术结果，技术通过也不替代客户业务验收。

完成案例设计的检查点：业务对象与状态定义不冲突；主模型 15 条 Fact 均有所属图、明确端点和语义；成功、不合格和超时路径闭合；34 类关系各有正例和 Golden Oracle；控制依附独立基础 Fact；结构 fan、Feature Value State 和负例有确定数据准备方式；每类非关系工具有可观察判据；标准来源、自拟内容、工具缺口和待业务确认项可分辨。以上是设计检查，不是运行结果。
