# OPM 手动保存、自动保存与草稿恢复策略

版本：0.1；日期：2026-09-14；状态：策略及逻辑契约 FROZEN；HS-01A~D 基础、HS-02A 增量事务、HS-02B~E 十三类命令/九条草稿路径、HS-02F 保存事务和调度核心、HS-02G Save/SaveState 与按需宿主/统一历史、HS-02H 多 Context 文本已交付。HS-02I Pin 接入范围见第22节及实施 Checklist；前端、启动模型发现、完整参数、用户库迁移切换和恢复容量尚未完成。

## 1. 来源、适用范围和优先级

用户确认“手动保存优先、10 秒自动保存、无变化不重复保存”，以及编辑实时保护与历史版本分离。以下规则适用于后继实现完成并迁移为 `JOURNALED_DRAFT_V2` 的模型；当前 `REVISION_PER_EDIT_V1` 继续遵守现有 API/SQLite 契约，不因文档冻结而改变运行模式。

本设计是新模式保存与草稿生命周期的唯一业务 owner；取代旧文档中“所有编辑返回新 committed_revision”“自动检查点只能指向 Revision”“Header 只显示 Revision”的要求，范围仅限新模式。正式保存点和历史 EXACT 读取仍采用不可变 Revision。此变更不改变 OPM 标准语义、Capability、对象身份或发布门槛。

ONLYOFFICE Docs 将变更同步与文件组装区分，支持手动和定时 forcesave；文档中的约 10 秒主要指编辑结束后的保存耗时，并非本设计的周期来源。[官方保存机制](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/saving-file/)

ONLYOFFICE Workspace 默认以新中间修订替换前一个，允许配置保留手动中间修订；自动中间修订仍替换。这里仅借鉴“恢复与历史分离”，不宣称复制其实现。[版本与修订管理](https://helpcenter.onlyoffice.com/workspace/userguides/documents-document-versions.aspx)

## 2. 三层数据与身份

| 层 | 职责 | 身份与保留 |
| --- | --- | --- |
| 草稿增量 Journal | 每个通过 Runtime 校验的编辑耐久记录，支持恢复和会话撤销 | model_id + draft_id + edit_seq；edit_seq 从 0 递增，保存不改变它 |
| 恢复 Checkpoint | 将增量压实为可恢复状态，降低重放成本 | checkpoint_id + covered_seq + content_digest；保留最新两个成功检查点及必要增量 |
| 历史 Savepoint | 手动保存、命名 Snapshot、Baseline、永久链接固定内容 | 不可变 revision_id；普通编辑和 AUTO 不插入 revision_document |

一个 Model 只有一个活动 draft_id，涵盖全部 OPD/Context。新建草稿、从历史创建草稿、Profile 迁移时分配新 draft_id；普通保存不轮换。独立 `draft_token={draft_id,edit_seq,binding_digest}` 用于候选、查询、命令与并发，不伪装成 revision_id。一次移动手势结束产生一个布局编辑；指针移动帧、选择、缩放、平移和面板开关不写 Journal。

每条增量保存已解析、已分配稳定 ID 的模型变更，不在重放时重新生成 ID、时间或重新执行易变的领域命令。OPL、Trace、提交校验摘要使用同一 token：编辑前仍执行校验和文本生成，成功事务记录其结果变化或可验证的内容引用。恢复不能依赖浏览器内存、当前时间或已升级 Profile。完整本文档内容集包括语义、全部 Context/Occurrence/布局、绑定及对应文本与追踪；不允许仅保存当前图。

M03 负责编辑应用和领域校验；M08 负责文本/Trace；M09 负责保存调度、历史与保留；M12 负责 SQLite 原子事务、恢复和压缩。前端只能显示 Runtime 的耐久/保存状态。

## 3. 保存按钮、状态和 10 秒调度

工具栏增加保存图标，提示“保存 / Save (Ctrl/Cmd+S)”，不额外占一行。快捷键在工作台内拦截浏览器保存网页行为；名称/关系编辑器中的输入尚未提交时先按该编辑器既有规则完成输入，校验失败则保留输入且不宣称保存成功。IME 组合输入期间不强制提交。

| 动作 | 固定行为 |
| --- | --- |
| 首笔未纳入检查点的耐久编辑 | Runtime 记录 dirty_since，截止时间为其后 10,000ms |
| 截止前继续编辑 | 不重置 dirty_since，不无限 debounce |
| AUTO 到期 | 捕获当前已耐久 edit_seq，形成恢复检查点；不新增历史 Revision |
| MANUAL | 立即保存点击时已排队编辑所覆盖的序号；形成/复用手动保存点 |
| 无内容变化 | 返回 UNCHANGED，零新增内容 blob、零新增历史 Revision |
| 只读、未加载、恢复失败 | 禁止保存；不切回 HEAD 绕过只读 |

10 秒是健康 Runtime 下的调度期限，不是硬件故障时的完成承诺。调度由 Runtime 负责，不依赖浏览器后台定时器。截止已过且 Runtime 重启恢复完成时立即调度。失败后按 1、2、4、8、10 秒退避，后续固定 10 秒；手动重试可立即触发，禁止忙循环。

进程内使用单调时钟计时，持久化 UTC dirty_since 供重启恢复；重启时墙钟倒退或期限无法可信恢复则立即调度，不延长恢复窗口。成功保存只清理 captured_seq 及之前的待处理范围；有后续编辑时，期限取最早未覆盖编辑的时间。

状态分别表达：待送达、草稿已保护/等待保存、保存中、已自动保存、已手动保存、保存失败。Header 紧凑显示“活动草稿 · 编辑 N”，最近历史 Revision 放入提示或版本面板，不用不存在的 committed_revision 表示当前草稿。保存成功只覆盖 captured_seq；期间的新编辑继续显示待保存。

## 4. 手动优先与去重

每个模型一个串行保存协调器，事务不可抢占。MANUAL 取消尚未执行且已被覆盖的 AUTO；正在执行的 AUTO 不回滚。相同目标内容可复用正在形成的检查点，随后原子登记手动保存点。待处理状态展示最高目标序号；不同请求仍保留各自 exact captured token 并 FIFO 执行，不能把较高目标冒充所有请求捕获的内容。MANUAL 均先于下一个 AUTO；同 ID 同请求共享在途操作，不同 ID 同内容由事务去重，不能并行生成重复 Revision。此处以 HS-02F 的精确捕获规则取代早期“只合并最高目标”的歧义。

内容摘要是版本化 `SaveContentDigest/1`，覆盖模型语义、全部 OPD 布局、稳定业务 ID 和 exact Profile binding；排除 revision_id/sequence、draft token、生成时间、保存原因、操作历史、视口与候选。生成文本和 Trace 是同内容同绑定的派生结果，单独校验 artifact digest，不因其修订衍生 ID 导致内容误判变化。浮点布局编码必须复用已冻结 Projection Digest Closure 的编码 owner，不将 double 交给仅安全整数的共享 JCS writer。

浮点编码依据：[Projection Digest Closure](opm-dev-canvas-06-projection-digest-closure-design.md)。它只提供编码基础，不把 Projection 的字段集合直接当作保存内容集合。

是否新增手动保存点与“最近手动保存点”的内容比较，而非仅与最近 AUTO 比较：

- 两次手动保存内容相同：返回原 revision_id，无新增版本。
- 自动保存已覆盖新内容，随后手动保存：仍保留该手动保存点，复用检查点内容，不复制模型 blob。
- 编辑后撤销到最近手动保存内容：无新版本；更新检查点覆盖序号以确认当前恢复状态。
- A→B→A 且 B 已手动保存：再次保存 A 是新的历史事件，可复用 A 内容 blob；不能复用更早 revision_id 使历史顺序倒退。

摘要算法的完整字段投影、Node/Java parity vectors 和 schema version 在实现切片 HS-01 中物化并验证，禁止复用含时间戳的 document_digest 作为保存去重依据。

## 5. 原子事务、并发与失败

编辑事务：校验 base draft token、绑定与幂等 → 应用编辑并校验/生成文本 → 写增量、派生变化、操作记录和幂等收据 → CAS 更新 draft head → SQLite commit → 返回 DURABLE。任一步失败不推进 edit_seq。客户端仅收到 DURABLE 才把草稿标为已保护；不把后台 ACCEPTED 当成功。

保存事务：固定 captured token → 物化并核对内容/派生摘要 → 写检查点内容或复用内容 → MANUAL 时登记不可变 Revision 与历史引用 → 更新保存覆盖状态及收据 → commit。保存失败保留 Journal 和旧检查点；不清除 dirty、不生成半保存点。保存后出现的新编辑不回滚、不被旧 checkpoint 覆盖。

捕获 token 时即取得恢复内容的读保留引用，完成或失败释放；压缩与保存协调使用同一模型锁及数据库事务守卫，不能删掉在途保存/Pin 的依赖。覆盖序号只可前进。已不可重建的旧 token 返回 DRAFT_CONFLICT，不能改为固定最新内容。客户端处理延迟响应时按 token 更新对应状态，不把旧响应写到当前投影。

双标签页仍可能并发：编辑按 draft token CAS，失败返回 DRAFT_CONFLICT，不自动覆盖或重新解释旧候选。保存只固定捕获内容，不改变 edit_seq；因此纯保存不会使候选失效。候选、删除 impact_token、异步 Finding/OPL 结果均绑定 draft token，新的编辑仍使旧候选失效。

编辑幂等范围保留 operation/model/command_id；保存使用 operation/model/save_id。相同 ID 与同请求摘要返回原收据，不同请求返回 IDEMPOTENCY_MISMATCH。收据保留整个 Model 生命周期，不随 Journal 压缩删除，避免断线重试重复执行；精简收据仍会线性增长，不宣称数据库恒定大小。

首发失败码：DRAFT_CONFLICT、READ_ONLY_REVISION、RULE_VERSION_CONFLICT、IDEMPOTENCY_MISMATCH、PERSISTENCE_FAILED、DRAFT_RECOVERY_REQUIRED；非法输入沿 INPUT_INVALID。存储/文本失败保留既有领域错误，不统一改码。HTTP 映射沿现有错误类别，在 HS-01 OpenAPI 中显式定义。

## 6. 恢复与本地未确认操作

首发不开放离线建模。发送前将 exact 命令（含已分配 command_id、base token、binding、payload）存入 IndexedDB 待确认队列；队列写入失败时阻止该命令发送并提示“本地恢复保护不可用”。收到耐久收据后删除队列项。候选、输入法半成品不冒充已接受编辑。

重开先恢复 Runtime 草稿，再查队列中的命令收据：已提交则确认，不存在且 base token 仍匹配时以原 command_id 重试；冲突或 Profile 改变则保留待处理输入并显式提示，不分配新 ID 偷偷重放。IndexedDB 清理、磁盘损坏和未落盘输入不在零丢失保证内。

Runtime 启动从最近有效 checkpoint 重放后续连续增量，验证序号、绑定、内容与派生摘要；最近检查点损坏可从前一检查点及保留增量恢复。两份都不可用、增量断链或摘要错配则进入 recovery-required，禁止用旧状态伪装最新草稿成功。

关闭/刷新时尝试刷新待送达队列并请求检查点，但退出钩子不是唯一耐久机制。已收到 DURABLE 的内容可恢复；未确认命令显示未完成保护状态。正常关闭不额外生成历史版本。

## 7. 保留、压缩与历史引用

恢复默认保留最近两个已验证成功的检查点，并保留从较早检查点到最新 edit_seq 的所有恢复增量。第一个检查点以初始草稿种子为回退。压缩必须先验证最新两个检查点和重放结果，再在事务中删除已覆盖且无其他引用的旧 Journal/检查点，不能先删后写。

单会话撤销默认保留最近 100 个已完成编辑（含布局）的可逆数据；刷新结束该撤销会话。压缩必须额外保护活动撤销窗口，不把“形成检查点”当作清空 Undo 的理由。操作历史保留命令、时间、结果和摘要，可失去完整历史模型重建能力，UI 不提供不存在的逐编辑永久链接。

首发禁止自动删除手动保存点、命名版本、Snapshot、Baseline、永久链接、备份/导出任务持有的版本及其依赖资产。已有历史 Revision 完整保留。自动检查点不进入默认版本列表；恢复面板最多显示两个检查点。历史默认显示手动保存点和命名版本，细粒度动作进入操作历史。

压缩减少冗余正文，不保证 SQLite 文件立即缩小；空闲页可复用。VACUUM 必须是独立维护任务，不在每次保存中执行。首发不自动删除精简操作记录/幂等收据，存储增长收益须实测，不承诺固定压缩比例。

## 8. URL、发布、导出与迁移

HEAD URL 继续稳定为 `?context=...`；draft_id/edit_seq 不进入 URL。复制永久链接时先把点击时捕获的草稿固定为受保护 Revision，成功后才复制 EXACT URL；失败不得复制 HEAD 冒充永久链接。该固定操作不标为手动保存，且不清除较新编辑的待保存状态。命名 Snapshot、Baseline、导出使用同一固定状态服务；Baseline 仍要求该固定状态的全量校验通过，不能因保存成功就成为 Baseline。活动任务必须持有保留引用。

数据库采用新迁移增添草稿、增量、内容、检查点、保存收据与模式标识，不修改 V1/V2 原文件，不移除 revision_document 不可变触发器。正式 Revision 0.2 与原生交换格式不因草稿内部实现变化而隐式升级；v2 历史读取统一物化为既有输出契约。增量数据不得直接塞进旧 document_json 当作完整 Revision。

迁移以模型为事务单元：停止写入 → SQLite 一致性备份 → exact 读取旧 HEAD 与绑定 → 建立 draft seq=0 和恢复种子 → 比较全部 OPD/OPL/Trace → 原子切换模式。保留旧 HEAD 与全部旧历史 ID。失败保持 V1，不能双写两套 HEAD。旧 v1 客户端对已迁移模型的写入稳定拒绝升级要求，不允许仅靠按钮隐藏守卫。

新程序可读未迁移 V1 和新 V2；旧程序不能识别新模式，故新模式启用后的数据库禁止被旧二进制打开写入，部署回退需先停写并用新程序导出最新草稿或恢复迁移前备份。不能宣称旧版任意降级兼容；必须告知恢复旧备份不含迁移后的编辑，并保留当前数据库副本。

## 9. 验收场景与实现入口

1. 连续编辑 30 秒：每个耐久编辑可恢复，AUTO 至少按健康调度的三个期限执行，历史 Revision 不因 AUTO 增长；不得因持续输入无限延后。
2. 首次手动保存、连点两次、AUTO 后手动、A→撤销→A、A→B保存→A，验证版本/内容/序号计数。
3. AUTO 排队/在途时 MANUAL，保存期间新增编辑、两标签页并发、响应丢失重试，验证无重复版本、无新编辑丢失。
4. 编辑 commit 前后、检查点写入、历史登记、压缩各处强停；恢复到最后 DURABLE，或明确 recovery-required，零半模型。
5. 至少两张 OPD 和共享对象，语义与布局、OPL/Trace 同 token；读旧历史和永久链接不随草稿变化。
6. 10,000 次布局编辑＋10,000 次语义编辑的受控对照：统计 Journal/Revision/内容 blob/收据数、SQLite 页及文件字节、保存与重开耗时。至少证明每次编辑不再复制完整 revision_document；不以“列表少了”替代容量证据。
7. 新数据库、已有 V1/V2 migration 数据、迁移失败重试与备份恢复；旧只读历史保留、未知模式拒绝、只读保存禁止。

实施顺序和边界见 [实现任务](../../specs/opm-hybrid-save-strategy-implementation-task-spec.md)，设计检查见 [Checklist](../checklists/opm-hybrid-save-strategy-design-checklist.md)。

## 10. HS-01A 机器基础（2026-09-11）

保存接口为 `POST /api/v2/projects/{project_id}/models/{model_id}/draft/save`；固定版本为同根 `/draft/pin`；状态查询为同根 `/draft/save-state`。三者仍使用 v1 相同的 loopback、Host/Origin 和本地会话头约束。Schema owner 为 `opm-draft-save-v02.schema.json`，Java/TS 从该文件生成；HS-01A 当时只交付接口描述，HS-02G 已装配 Save/SaveState（含 GET 安全校验），Pin 由第22节接入。

请求字段必填：SaveRequest={save_id,target_draft_token,reason}，reason 仅 MANUAL；PinRequest={pin_id,target_draft_token,purpose}。AUTO 是 Runtime 内部应用动作，不接受公共请求传入。DraftToken={draft_id,edit_seq,binding_digest}，序号为 0..9007199254740991；digest 为 64 位小写十六进制。所有 object 封闭，所有字段必须出现，nullable 字段显式 null，禁止省略。

SaveResult 固定包含 save_id、status、captured_token、checkpoint_id、revision_id、head_token；status 为 SAVED/UNCHANGED，手动保存结果 revision_id 不可为 null。内部 AUTO 的 CHECKPOINTED 结果留给 Runtime 内部协议，不混入公共保存响应。PinResult 包含 pin_id、revision_id、captured_token。SaveState 的 checkpoint_token、last_manual_revision、dirty_since、deadline、pending_manual_target、last_error 可为 null；durable_token 必须存在，in_flight 为 NONE/AUTO/MANUAL/PIN。时间为 ISO UTC 毫秒形式。非 null checkpoint 与 pending token 必须属于相同 draft/binding，checkpoint 序号不超过 durable 序号；dirty_since/deadline 同空或同非空且差 10 秒。这些跨字段不变量由应用层验证，Schema 与生成类型不冒充服务校验。

错误 HTTP 固定：INPUT_INVALID=400，DRAFT_CONFLICT/IDEMPOTENCY_MISMATCH/RULE_VERSION_CONFLICT/DRAFT_MODE_REQUIRED=409，READ_ONLY_REVISION/LOCAL_SESSION_INVALID=403，SAVE_VALIDATION_BLOCKED=422，PERSISTENCE_FAILED/DRAFT_RECOVERY_REQUIRED=503，NOT_FOUND=404；错误体封闭为 code/message/retryable。503 与 retryable 不等价：恢复阻断不可盲重试。新增三个错误码由 HS-02G 同步机器 owner 和两端生成物。

待启用 SQL 仅新增模式、活动草稿、不可变内容 blob、检查点、增量、独立历史映射、幂等收据和保留引用。没有模式行等价 V1；V2 的 mode→draft 和 draft→检查点关系必须同事务成立。独立历史映射不向旧 revision_document 填入假完整 JSON。V2 模型的旧 revision_document INSERT 和 model_head UPDATE/DELETE 被新 guard 拒绝；新模式的保存只写独立历史映射，不走旧头指针。旧触发器不移除。正式启用前还必须接通 unified history reader 和应用错误映射。

## 11. HS-01B 内容摘要与迁移准备（2026-09-11）

SaveContentDigest/1 的字段、浮点、错误与无损拆分唯一契约见 [HS-01B 规格](../../specs/opm-hybrid-save-content-digest-task-spec.md)。机器 Schema 为 `opm-save-content-v1.schema.json`，Java 资源为其相同 bytes 镜像，生成器锁定源 Revision Schema；不能随源 Schema 修改而重解释旧摘要。

摘要读取完整原始 JSON 的业务字段，保留模型名称/描述、对象业务属性、全部 Context 和 route_points；禁止用有损 SemanticRevision DTO 或当前画布投影替代。几何值复用 Projection 的 binary64 编码函数，保留负零，所有数组保序、可选字段保留存在性。非几何整数形状 `1.0/1` 归一到安全整数；字符串不做 Unicode 归一化。

split/join 保留整个文档的内容和顶层元数据，经过重新校验后按 JSON 值无损还原。Revision ID、序号、派生文本/Trace 和验证摘要不进入内容去重，但不被丢弃；后继迁移仍须独立保存原始 bytes、校验派生工件、执行数据库备份和事务切换。本轮没有迁移/启用模型，也不提供草稿 HTTP handler。

## 12. HS-01C 离线迁移准备（2026-09-11）

[HS-01C 规格](../../specs/opm-hybrid-save-preparation-task-spec.md) 定义并实现 SQLite 原生一致备份、隔离 V3 迁移、edit_seq=0 的草稿事务初始化与独立 verifier。DraftPreparationRequest/Report 复用保存 Schema 的封闭字段和生成类型，属于内部接口，不增加公共 HTTP 操作。

备份包含 WAL 中已提交数据，源库只读；旧 Revision 原始 JSON、Snapshot/Baseline 与其他表数据逐项保留。草稿的 model_json 存储完整内容，artifact_json 保存独立元数据，其存储摘要与 OPL/Trace 业务摘要分开。事务中途失败回滚三张草稿表，失败根没有 report.json；同一根并发调用不能覆盖未完成副本。

输出 `backup.sqlite/prepared.sqlite/report.json`，完成报告在数据库封存、回读校验、fsync 后原子发布。合法同输入重试只验证并返回原报告；失败根保留且不续写。当前报告状态仅 PREPARED，候选库未插入 model_save_mode，源模型未切换。恢复备份和新模式激活必须由后继流程显式执行；不能据此认为当前工作台已有保存功能。

## 13. HS-01D 草稿命令与查询协议（2026-09-11）

[HS-01D 规格](../../specs/opm-hybrid-save-draft-workspace-contract-task-spec.md) 冻结九条新增 HTTP 操作及 13 类结构化命令，配套 [OpenAPI](../contracts/openapi/opm-draft-workspace-v02.json)、生成 Schema、TypeScript 判别 union、Java 严格 JSON 包装器。保存/Pin/保存状态继续使用第 10 节三条路径；HS-01D 当时只交付协议，当前 HTTP 接入范围见第 15 节。

草稿请求使用完整 token，查询 meta、候选 expiry、删除 impact 全部绑定同一 token/context，不继承 v1 的 Revision 授权。所有命令统一携带 scope 和 authorization；旧 payload 中重复的候选 ID 移到公共 envelope，Control 仍只能修改基础 Fact。新投影补齐并封闭端点、布局等旧版任意 Map 字段。新 envelope 的 nullable 字段必填；复用业务 payload 的可选字段保持缺失语义，不强行填 null。

请求去重采用独立 DraftEditRequest/1：排除 transport request_id，保留 command_id、project/model、token、scope、授权和完整 payload。所有数字先按 binary64 大端小写 hex 编码，再通过既有整数 JCS 求 SHA；保留 -0，不能影响 SaveContentDigest/1 的内容去重口径。查询/候选/删除影响的生产摘要顺序及首错处理见规格第 3 节。Schema 解码和跨字段校验不代替实际模型校验、候选授权和数据库事务。

HS-02A/02B 已交付无损增量、同事务 DURABLE 收据、首批元素命令和草稿投影/文本；仍需覆盖全部领域命令与候选、完整恢复和保存调度。禁止将旧 revision_id 改名为 draft_id 或写入临时 revision_document 伪装完成。当前工作台仍使用 V1，未启用用户数据库的新模式。

## 14. HS-02A 增量事务与耐久收据（2026-09-11）

[HS-02A 规格](../../specs/opm-hybrid-save-journal-transaction-task-spec.md) 与 [增量 Schema](../contracts/schemas/opm-draft-journal-v1.schema.json) 固定两份可逆 JSON 增量、前后摘要和恢复时的逐槽守卫。增量分别覆盖完整业务内容及派生/历史元数据；缺失/null、Unicode、数组顺序与负零均保留。DraftJsonDigest/1 对数字与容器全部加类型标签，避免通用 JSON 值与 binary64 编码碰撞；业务保存去重继续使用 SaveContentDigest/1。

DraftJournalRepository 仅供可信应用服务调用，在已有 V2 数据库中以 BEGIN IMMEDIATE 原子写入 Journal、CAS 序号、耐久 receipt，提交后才能返回 DURABLE。旧 Revision、HEAD、内容 blob 和 checkpoint 不随每次编辑增加。UNCHANGED 只新增收据；首个 dirty_since/deadline 保持到检查点覆盖，连续编辑不重置期限。重试不再调用领域修改函数，读入时从当前 checkpoint 重放连续增量并验证内容/派生摘要及收据关联。

本切片没有默认迁移/激活入口，不把浏览器文档当作可信 Proposal，不代替候选校验、Profile/OPL/Trace 生成；这些仍须由后继领域应用服务接入。只有临时 SQLite 的并发、事务异常回滚与重开证据，没有浏览器保存或 OS 强停证据；双 checkpoint fallback、压缩和 10 秒 scheduler 尚未交付。

## 15. HS-02B 首批领域命令与 HTTP（2026-09-13）

[HS-02B 规格](../../specs/opm-hybrid-save-element-http-task-spec.md) 接入 Object/Process 创建、名称编辑和 owned Object/Process/Attribute 移动，提供六条真实草稿 API。首批命令复用现有纯领域规则；创建只追加新项，改名只修改 name.local_name，移动只修改 x/y。正文中的描述、语义属性、数组顺序、几何 route_points 和负零保留；语义 DTO 仅计算视图，不能回写整份正文。

候选 query/option 身份复用 HS-01D 完整数字编码，提交在 SQLite 写事务内依据 actual token/model 重算。核心节点使用受控 Symbol 映射和 exact Grammar/RuleSet 整资产引用，不伪造 Profile 中不存在的节点三元组。真实变化完成语义校验、Profile 装配和 OPL/Trace 生成后再 Journal 提交；无变化只留幂等收据。对外校验覆盖标记 INCOMPLETE，不声明 ISO 完整符合性。

HTTP 保留 raw 请求直到严格解码，独立 v2 本地安全拦截与封闭错误体；新增 LOCAL_SESSION_INVALID/403 和 COMMAND_NOT_IMPLEMENTED reason。open 同快照返回当前 token、checkpoint token 和保存状态；不触发迁移。查询结果仅代表所校验的 token，前端尚未接入。

HS-02B 交付时其余十类命令、navigation/findings/relation-catalog 明确拒绝；当前扩展范围见第 16 节。10 秒 scheduler、手动保存、Pin、模式激活、双 checkpoint fallback 和浏览器保存仍未交付。测试只在隔离临时 SQLite 显式迁移激活，当前用户库及工作台不变。

## 16. HS-02C Feature/State 命令（2026-09-14）

[HS-02C 规格](../../specs/opm-hybrid-save-owned-construct-task-spec.md) 接入 Feature 创建、State 创建/修改及四种 State 展示命令，累计十类。Feature 支持 Object/Process owner 的 Attribute/Operation；State 支持 Object 和两类 Feature owner。候选由当前 token 与根 Context 可见目标产生；明确 SUPPRESSED 的 State 可在 owner 可见时通过 State ID 恢复，不接受已删除 occurrence ID。

创建 occurrence 仅允许 OWNED 与精确 construct_role；capability_ref、可选 version、owner/expected_owner locator、所选目标逐项复核。v2 State 名称上限为 256 Unicode code point，不 trim；不存在于 State 持久化的 ordinal 在 wire 入口拒绝。Context 与 scope 不符沿原 wire invariant 返回 INPUT_INVALID/400；角色、Capability 和 owner 伪造返回 DRAFT_EDIT_REJECTED/422。

正文写回独立于有损语义序列化：创建只追加新增项及关联 ID；更新 State 只修改 local_name/state_roles，保留 namespace/source/normalization/owner；展示只影响本 Context 的 State presentation/occurrence/layout。隐藏保留语义 State 和 Fact，显示分配新 occurrence/layout；Feature State 恢复为 FEATURE_STATE_NODE。无变化不补默认 presentation/空角色字段，等价角色集合不改原顺序；不增加 Journal。

真实修改仍经模型校验、exact Profile 装配和 OPL/Trace 生成后原子提交。HTTP/临时 SQLite 回归覆盖创建、无损保留、拒绝、幂等、重开及 State-specified Fact 文本一致性。HS-02C 交付时关系/删除未接入，当前扩展见第 17 节；不构成前端保存、强停恢复或容量验收。

## 17. HS-02D 关系/删除命令（2026-09-14）

[HS-02D 规格](../../specs/opm-hybrid-save-fact-lifecycle-task-spec.md) 接通三类余下命令，沿实际 DraftToken 重算 query/option/impact。旧入口保留 Revision 授权，草稿只复用纯目录和领域变更，不伪造旧授权。端点 role/kind/id/ordinal/state qualification 和可选 occurrence locator 绑定真实候选；Control 附加与移除使用专属候选，只修改原 Fact。

创建只追加对应实体和布局，更新只回写明确字段；同值更新不生成新 endpoint ID。局部端点更改保留未变端点的原 ID/optional 字段，保留其他原始语义元数据和布局。按 active fixture 修正 CAP-ISO-STRUCT-004 的 Catalog direction 为 UNDIRECTED，保持互惠单句与双端 harpoon，旧模型仍可读取。此修正同时作用于 v1/v2 候选，不改 Profile bytes。

删除影响包含领域依赖、occurrence、Context 以及本次重算的真实 OPL sentence/Trace。Context/OPL/Trace DIRECT 表示更新/重算，不能解释为删除 Context。核心校验失败拒绝生成影响，成功时 findings=0 且 coverage 仍 INCOMPLETE。DELETE_TARGET 的依赖阻断不能由前端绕过；只有独立 CASCADE 选项允许级联，REMOVE_OCCURRENCE 不删语义目标。错误影响返回 DRAFT_EDIT_REJECTED/IMPACT_TOKEN_STALE；旧 token 返回 DRAFT_CONFLICT。

本轮仅单 Context 删除。condition、CREATE 非空 logical_groups、UPDATE logical_groups（含清空意图）、label_positions/junction_position 尚未实现，明确拒绝，不能以忽略参数冒充成功。测试覆盖 26 类基础关系及 8 类 Control 的代表性闭环，不替代全部标准 variant/golden 或发布验收。HS-02D 交付时三条查询待办，后继见第 18 节；保存调度、UI/模式切换、强停恢复及容量验收继续待办。

## 18. HS-02E 草稿查询（2026-09-14）

[HS-02E 规格](../../specs/opm-hybrid-save-draft-query-task-spec.md) 接入 navigation/findings/relation-catalog。五条只读查询从同一 snapshot 验证 exact DraftToken、Context 和 Runtime active binding，装配 exact Profile，不读旧 Revision 索引。全部查询零新增 Journal、receipt、Revision 或 checkpoint。

关系目录新增独立请求 DraftRelationCatalogRequest，selection_id 必填 nullable，仅接受本图可见 Fact 或 Fact occurrence。null 时 Control 禁用；目录固定 16/8/10，以当前资产的 Capability symbolRef 和 SymbolCatalog version/digest 为准，非根 Context 禁用创建。目录可用性不代替端点/参数候选授权，Fact 删除后原选择被拒绝。

导航如实将所有 Context 按类型分组平铺，组内按 ID 排序，has_children=false，current_path 只有当前 Context；存储没有 parent，不推断细化层级。后续完整细化树仍需独立持久化和查询契约。

问题列表改为 {items,validation_scope:"MODEL",validation_summary}，从当前 SemanticRevisionValidator 实际重算、去重、排序，保留 code/locator/message。核心问题无唯一图归属，context_id=null；调用视图仍在 meta 中。稳定 ID 由 DraftFinding/1 绑定 project/model/token 和问题正文，不依赖请求 ID、时钟、图或旧 Revision。计数按实际结果，coverage_state 固定 INCOMPLETE；无核心问题时仍须完成真实 OPL/Trace 生成验证，生成失败不能返回伪造空列表。

HTTP/临时 SQLite、两端协议和摘要 parity 已验证。此切片不改变用户画布或用户库运行模式，10 秒自动保存、手动保存、Pin、前端队列、双 checkpoint fallback 和容量验收仍未完成。

## 19. HS-02F 保存事务与调度核心（2026-09-14）

[HS-02F 规格](../../specs/opm-hybrid-save-coordinator-task-spec.md) 实现内部 MANUAL/AUTO 保存事务及单模型协调器。新增 V4 检查点差量层，基于去重 content blob 还原每次捕获的精确内容和元数据，再接续 Journal；避免 A→B→A 复用旧元数据而破坏恢复。V4 位于独立 sqlite-checkpoint/ 目录，旧 HS-01C 的三份迁移及 PREPARED 输出不变，默认 Runtime 仍不加载新迁移。

保存事务复用 Journal 的 SQLite 锁、scope、恢复校验和无损摘要。AUTO 只形成/复用 checkpoint；MANUAL 与最近手动内容比较，登记/复用独立 draft_savepoint，并原子写 SAVE receipt。相同内容只复用 blob，不覆写旧数据；恢复覆盖只前进，保存旧 target 保留更高序号及其最早 dirty 时间。所有保存均不改变 edit_seq、legacy revision_document 或 model_head。

协调器接受明确模型和可信校验 callback，由宿主显式注册、启动外部 executor；每 100ms 调度一次，MANUAL 优先于到期 AUTO，单调时钟控制10秒期限和存储失败退避。相同在途请求共享 future，当前 AUTO 事务不可抢占。非可重试 AUTO 错误暂停自动执行；手动保存可显式重试，成功后清除阻断。close 不关闭宿主 executor 或回滚已执行事务。

HS-02F 当时只交付内部核心；HS-02G 的后继接入见下一节。生产模型发现、重启扫描注册和前端保存按钮仍未交付。保存目前保留所有 checkpoint/Journal，双检查点 fallback、压缩、OS 强停和容量证明仍待后继；测试不迁移用户库。

## 20. HS-02G 保存入口、按需宿主与历史读取（2026-09-14）

[HS-02G 规格](../../specs/opm-hybrid-save-http-history-task-spec.md) 接通 Save/SaveState 和真实 Profile/核心/OPL/Trace 校验；OpenDraft 共享宿主 SaveState。只注册明确访问的 project/model，100ms 调度驱动已有10秒期限。MANUAL 优先和幂等沿用 HS-02F；GET SaveState 同样要求本地 Host/Origin/session，不改变 v1 GET。关闭停止排队和 timer，等待在途事务，不中断 SQLite 提交；再次打开从已耐久 deadline 恢复调度，不做未知目录扫描。

保存点通过不可变 content blob 构造语义读取视图，全局 sequence=冻结 legacy MAX(revision_sequence)+history_sequence，写入上界为现有语义 Integer.MAX_VALUE。blob raw metadata SHA、内容摘要和模型身份均验证；不依赖当前 Journal/checkpoint，不改写旧表或 metadata。新 Revision ID/序号仅用于语义视图，OPL/Trace 按 exact Profile 和新身份生成；不能把该视图当作完整原生交换包。历史列表合并旧 Revision 与新保存点，MANUAL 暂沿用 v1 kind=DRAFT，AUTO 不入历史，EXACT 仍只读。损坏拒绝，不回退旧 HEAD。

草稿 HTTP 响应中 DraftToken 的 edit_seq 固定输出整数词法，允许将原 token 直接提交到严格 SaveRequest；不规范化布局小数、负零或原始请求。SaveError 的新增枚举与 workspace 内嵌 SaveState 同步生成。

HS-02G 交付时 OPL owner 只生成 root SYSTEM_DIAGRAM，非根 Context 保存阻断；这一历史范围由下一节 HS-02H 替代。保存始终逐 Context 校验，不跳过失败子图。Pin/Baseline/Export 接入、前端、启动发现、在线迁移及容量恢复仍待后继；没有启用用户数据库或更换用户前端运行模式。

## 21. HS-02H 多 Context 文本与整模型保存（2026-09-14）

[HS-02H 规格](../../specs/opm-hybrid-save-context-text-task-spec.md) 支持显式已物化的 SYSTEM_DIAGRAM、PROCESS_REFINEMENT、OBJECT_REFINEMENT、MODEL_VIEW 分别生成 OPL/Trace。Context 成员必须存在、属于本图且完整，不接受重复、悬空、跨图或遗漏 occurrence；PROFILE_CONTEXT 和未知 Context 仍拒绝。该支持不等于 Context CRUD、细化树、引用视图或多图删除已经实现。

Legacy 和 ISO 文本规划只消费当前 Context 中显示的 Fact，按 Fact ID 去重；其他图关系不进入当前图的句式分支或输出。保留当前图 OWNED Fact/必要端点 owner 规则，REFERENCED/VIEW_DERIVED 不能替代必要 owner。全模型保存另要求每个 Fact 至少有一个 OWNED occurrence，然后执行全部 Context 的真实 Profile/OPL/Trace 校验，任一失败返回 SAVE_VALIDATION_BLOCKED/422，零部分保存。

根图句子、Token、Trace 和 Artifact 的现有身份公式保持不变。非根句子 ID 为 identifier("sentence", context_id, existing_sentence_id)，Token/Trace 沿原规则从句子身份派生；Artifact/Paragraph 沿既有 revision/context 公式。共享 Fact 的子图句子可同文，但身份和 occurrence source 按图隔离；空图保留一个空 Paragraph、零句子/Trace 和有效 Artifact。历史按保存内容及新 Revision 身份重算，不依赖当前草稿，保存后共享对象改名不能改变旧历史子图。

验证范围是临时 SQLite/HTTP、多 Context 文本和根 golden 回放；实际结果见实施 Checklist。未接前端保存、未迁移用户库，未证明浏览器、OS 强停或容量阈值。

## 22. HS-02I 固定版本与保留引用（2026-09-14）

[Pin 规格](../../specs/opm-hybrid-save-pin-task-spec.md) 接入既有 /draft/pin。Pin 捕获请求中的 exact token，执行与 Save 相同的全模型校验；同用途/草稿/捕获序号/内容复用固定点，其他捕获新建历史事件，正文按 content digest 复用。每个 pin_id 对应耐久 PIN 收据及 revision-only 保留引用，不改变 last_manual_revision；MANUAL 去重继续只比较手动历史。

MANUAL/PIN 共用显式 FIFO，均先于未开始 AUTO；在途事务不被中断。状态可观测 PIN，但 pending_manual_target 只包含手动请求。幂等命名空间按 operation/model/id 隔离，摘要身份版本为 DraftPinRequest/1。重试验证捕获身份、用途、保留引用及历史内容/绑定摘要，不重新生成版本、不依赖旧 Journal/checkpoint；失败不补写或修复原收据。

V5 独立位于 `docs/contracts/migrations/sqlite-pin/`，不进入默认迁移：事务重建 draft_retention，修正 V3 的可空 min_edit_seq 被 typeof CHECK 拒绝的问题，原行和其他约束保留。Pin 要求 V4+V5，否则 DRAFT_RECOVERY_REQUIRED；Save/AUTO 继续兼容 V4。revision-only 引用的 checkpoint_id/min_edit_seq 为 null，禁止用占位序号使永久版本连带永久保留 Journal。未对用户库执行此迁移，生产迁移、规模/锁时间和恢复切换由后继验证。

PinResult 的 revision_id 可通过既有 EXACT workspace/projection/text 打开，仍只读。purpose=SNAPSHOT/BASELINE/EXPORT 仅保护将来的消费者输入，并未创建对应业务实体、执行全量 Baseline 验收或生成导出包。前端复制永久链接仍待接入；不能以固定成功冒充这些后继流程完成。

## 23. HS-03A 浏览器传输边界（2026-09-14）

[浏览器传输规格](../../specs/opm-hybrid-save-browser-delivery-task-spec.md) 冻结并实现 V2 生成类型的 API 适配、请求身份和 IndexedDB 待确认条目1。IDB 写事务必须 strict 且 complete 后才可发出原始 JSON；保留 -0，禁止重新分配 command/save/pin ID。请求摘要复用现有三类身份公式，不改变共享 JCS owner 或 Runtime wire。

每模型 EDIT 与 EXPLICIT 两通道，后者容纳 SAVE/PIN；跨页面原子新增，不能覆盖另一待确认请求。显式保存与编辑可以并行，UI 捕获点击之前的编辑边界仍由后续工作台 owner 实现。恢复先 open 再查原 operation/id 收据，匹配请求摘要及结果身份才删除本地项；无收据仅在允许 token 范围内重发原字节。网络/Runtime/存储/身份错误保留原条目，不自动丢弃或转交 V1。

当前未启用 UI 接入；后续工作台必须消费同 token 的投影/文本/问题和候选，不得借用 committed Revision 作草稿序号。状态轮询采用既有 OpenDraft POST 返回的 save_state，不从浏览器伪造 Origin 调用当前需要 Origin 的 SaveState GET。确定失败的待确认输入须有后续显式处理流程，本包不自动清理。

验证仅包括真实浏览器 IndexedDB 与受控 HTTP 替身、Web 回归和冻结摘要向量，未连接用户数据库。保存按钮、快捷键、永久链接和 Runtime 联调留给下一切片。

## 24. HS-03B 工作台接入（2026-09-14）

[工作台规格](../../specs/opm-hybrid-save-workbench-task-spec.md) 与 [验证记录](../checklists/opm-hybrid-save-workbench-checklist.md) 交付第23节的后继UI接入。仅已激活 V2模型使用 DraftWorkbenchSession；HEAD仅在 Runtime 明确 DRAFT_MODE_REQUIRED 时回到 V1，其他错误不能降级。EXACT保持统一历史只读。导航/投影/文本/问题/关系目录逐响应核对同token/context/request_id后整批应用；候选授权和十三类命令沿用现有封闭V2协议，不伪造Revision身份。

保存图标位于现有单行工具栏，Ctrl/Cmd+S与按钮共用输入完成流程：IME或非法名称不保存，候选未完成则阻断；等待已经发出的编辑，再捕获token调用MANUAL。保存期间允许后续编辑，晚到的保存结果只刷新历史/状态，不覆盖画布。无变化由 Runtime 去重。Pin完成后才复制精确Revision链接，后续导航或失败不得复制失配链接。原请求不确定时保留本地队列并提供恢复入口，禁止换ID重放。

每2秒用OpenDraft轮询，AUTO仍由Runtime十秒调度，前端不发送自动保存请求。已确认编辑显示“草稿已保护”，不把Journal耐久误报为手动保存。只有本会话成功的手动capture匹配当前token，或实际观测到自动checkpoint覆盖当前token，才能显示对应保存来源；重开不能由last_manual_revision推断当前内容已手动保存。Header、OPL输入与属性面板显示草稿编辑序号，最近真实Revision保留在历史/提示/永久链接。外部token变化停止本地编辑并要求重新加载；离开页面撤销快捷键、定时器并失效迟到结果。

核心Findings仍标INCOMPLETE，旧操作记录与发布capture不冒充V2草稿证据。当前验证连接独立临时SQLite/Runtime，包含手动去重、自动保存不新增历史、丢响应恢复、保存迟到和V1兼容；没有迁移或激活用户数据库。后继先完成受控模式切换与恢复入口，再执行容量、强停和完整迁移验收，不能由前端接通推导整体发布完成。

## 25. HS-04A 受控副本激活（2026-09-14）

[副本激活规格](../../specs/opm-hybrid-save-activation-copy-task-spec.md) 交付独立离线服务及ACTIVATED_COPY封闭报告。输入必须是HS-01C完整验证过且report raw SHA匹配的PREPARED；project/model/draft/revision/binding身份沿用其原值。输出镜像准备根与全新storage项目副本，显式注册冻结V1~V5迁移，只在副本单事务写入模式；seed仍为seq=0，旧HEAD/Revision/Snapshot/Baseline保留，不生成伪手动保存点。

当前API投影已有target_kind，不能套用旧发布Projection Digest 0.1。迁移独立冻结DraftActivationProjection/1：纯投影的所有字段保留，Float/Double递归转既有binary64编码后进入JCS；OPL/Trace沿用原canonical writer。全部Context按ID排序形成DraftActivationReadback/1摘要；源与恢复后的文档同时比较完整DraftJsonDelta数值视图，整数词法差异不误判，负零和扩展字段保持。核心语义、当前binding/资产、各Context文本证据及孤立Fact检查不替代完整ISO/规则符合性判断。

报告只有在模式事务、恢复读回与消费摘要比较完成，并将数据库封为独立文件、fsync之后才原子提交。独立verifier重新计算raw文件摘要、旧表等价、mode/seed/迁移记录与消费摘要；修改或开始编辑后的运行库不再适用原不可变报告。运行验证必须复制至另一个可写根，不修改已封装输入。

该切片只证明快照可激活。原库不切换，live HEAD不由报告推断；正式安装还需停写、源HEAD/binding复核、恢复与未知结果协调。现有V1写入虽被底层拒绝，但仍是通用PERSISTENCE_FAILED，专用升级错误与在线入口留后继。本轮测试使用真实临时SQLite和应用服务，未执行浏览器、用户库迁移、OS强停或容量证明。

## 26. HS-04B 未上线开发环境重置（2026-09-14）

用户明确放弃当前开发历史，采用[开发重置规格](../../specs/opm-hybrid-save-development-reset-task-spec.md)。停止实际 Runtime 后移出精确 `runtime-data/projects`，重启后从空项目库开始；不走已有用户模型迁移，也不把旧数据转换成新发布证据。

Spring 新建工厂默认完整 V1～V5；V3/V4/V5 从原冻结文件打包到独立位置，原 SQL 不变。历史工具的程序化旧构造器不改变。新模式不隐式升级已有旧库，需要另行显式迁移或重置。新模型的目录、完整初始 Revision、HEAD、seq=0 草稿内容/流/检查点及模式在同一事务内创建，失败全部回滚，重复 command 不重复创建；同项目多个模型互相独立。初始 binding 必须存真实对象，与文档精确一致。

新建工作台直接进入第24节的混合保存 UI。逐编辑日志保护、手动保存无变化去重、十秒自动检查点不增加用户历史版本继续沿用现有协议。该开发切换不证明历史迁移、生产发布、强停或容量完成。实际验证和数据移出位置见[检查表](../checklists/opm-hybrid-save-development-reset-checklist.md)。
