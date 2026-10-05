# 混合保存策略实施任务

Work Mode：change；Risk Level：L3；Task Type：feature。

状态：HS-01A~D 基础、摘要、离线准备及 wire，HS-02A 增量事务，HS-02B~E 十三类草稿命令及九条 HTTP 路径，HS-02F 保存核心、HS-02G Save/SaveState、按需宿主和统一历史读取、HS-02H 多 Context 文本与保存、HS-02I Pin、HS-03A/B浏览器传输和工作台保存、HS-04A受控副本激活已实现。实际验证见 [实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。参数和 Context 范围仍受各切片限制，完整 HS-01/02 尚未完成。设计依据：[混合保存与草稿恢复](../docs/design/opm-hybrid-save-and-draft-recovery-design.md)。在线安装/模式切换、专用V1升级错误、高级参数、完整引用视图语义、启动发现、强停恢复及容量仍未交付。

## 1. 目标、范围和兼容边界

实现模型级实时耐久草稿、手动保存、10 秒自动检查点、内容去重和有限恢复副本；旧历史链接和标准语义保持可读取。禁止仅隐藏历史列表或延迟所有持久化 10 秒充当完成。

允许修改 `services/local-runtime/src/main/java/org/opm/localruntime/{api,application,command,storage,semantic,text}/` 及对应测试；`apps/web/src/{shared/api,shared/types,stores,modules/workbench,modules/versions,app}/` 中受本任务影响的文件；`apps/web/src/shared/styles/base.css` 的保存状态样式；`docs/contracts/{openapi,schemas,migrations/sqlite}/` 的新增契约与生成入口；`scripts/` 中 API 生成、契约校验和本任务定向验证脚本；`tests/e2e/` 中本任务回归；关联设计、规格、Checklist。不存在的模块目录可在实际职责确定后建立，不为满足列表创建占位文件。

禁止修改 Profile 业务 bytes、Capability 门槛、原生交换格式、既有 V1/V2 迁移原文、旧不可变触发器、用户数据库、历史发布工件；不得生成假的 Release/ISO 证据。新增依赖需有独立必要性说明，默认复用现有 SQLite、Vue、测试框架。直接当前目录开发，不创建 worktree。

每个切片开始前记录实际文件集合与 git 基线，保护已有差异；不冻结不可维护的 source commit parent 链。发现字段级矛盾时先同步设计和机器契约，再实施，不通过测试放宽绕过。

## 2. 切片与交付顺序

### HS-01：机器契约、摘要与迁移

首个可独立验证的子切片 HS-01A 仅交付 DraftToken/Save/Pin/SaveState 机器契约、生成类型和待启用 SQL 基础。V3 SQL 放在 `migrations/sqlite/hybrid-save/`，不进入默认 `V*__*.sql` 资源包；测试显式注册该位置。模型从 V1 切到 V2 需 HS-01 余项及 HS-02 的应用守卫、完整内容验证完成，不能通过手工插入模式记录启用。该拆分保持当前已运行数据库不受影响。

Active Playbooks：backend-springboot (primary)、db-migration、testing。

新增草稿 v2 API，旧 v1 committed_revision 语义不变。逻辑操作集合固定为 OpenDraft、QueryDraftProjection、QueryDraftText、QueryDraftCapabilities、ExecuteDraftEdit、GetDraftSaveState、SaveDraft、PinDraftRevision、GetDraftReceipt。HTTP 路径、完整封闭 Schema、生成类型由本切片在设计附录中与 OpenAPI 同步冻结，之后才允许消费端实现；不得手写不一致的 Java/Vue wire 类型。

核心输入/输出必须包含：

- DraftToken：draft_id、edit_seq（非负安全整数）、binding_digest。
- 编辑：expected_draft_token、command_id、既有结构化 command union；返回 DURABLE 与 exact result token、受影响身份和投影状态，不返回假的 committed_revision。
- SaveDraft：save_id、reason=MANUAL/AUTO、target_draft_token；返回 CHECKPOINTED/SAVED/UNCHANGED、captured_token、checkpoint_id、nullable revision_id、当前 head token、两类保存状态。AUTO 不从浏览器公开任意触发，Runtime 调度调用同一应用服务。
- PinDraftRevision：idempotency ID、target token、purpose=PERMALINK/SNAPSHOT/BASELINE/EXPORT，返回真实不可变 revision_id；Baseline 仍走原校验服务。
- 状态：durable_token、checkpoint_token、last_manual_revision、dirty_since、deadline、in_flight、pending_manual_target、last_error。字段的可空性、错误 HTTP 映射、过期 token 保留窗口在本切片输出的 Schema 中逐项闭合。

实现 SaveContentDigest/1 canonical writer 和 Node/Java 正反向 parity vectors；覆盖浮点、Unicode、空集合、数组顺序、非有限数拒绝、时间/Revision 排除、布局/语义/绑定纳入。复用 Projection 浮点编码，不修改共享整数 JCS owner。

此摘要及原始 Revision 无损拆分由 [HS-01B](opm-hybrid-save-content-digest-task-spec.md) 交付；一致备份、隔离迁移、初始化/回读由 [HS-01C](opm-hybrid-save-preparation-task-spec.md) 交付；草稿编辑/查询 OpenAPI、封闭 Schema、两端解码和请求摘要由 [HS-01D](opm-hybrid-save-draft-workspace-contract-task-spec.md) 交付。HS-02B 已接入首批 HTTP 和模型授权生产，完整命令及在线模式切换仍未交付。摘要 API 接受封闭的原始 JSON，不接受会丢字段的语义 DTO。

迁移新增草稿、增量、内容 blob、检查点、历史映射和收据结构，完整约束/索引及迁移结果由实际 DDL 固定。对已有数据库执行备份→初始化→内容等价→模式切换；禁止在应用启动里藏临时建表。测试新库、旧库、失败、重复运行和旧程序写入拒绝；当前用户数据库不用于验证。

### HS-02：Runtime 草稿与恢复

Active Playbooks：backend-springboot (primary)、testing。

[HS-02A 增量事务与耐久收据](opm-hybrid-save-journal-transaction-task-spec.md) 已交付可信内部 Repository、可逆 JSON delta、当前 checkpoint 后连续重放和原子收据。不代表领域命令、HTTP handler、双 checkpoint fallback 或保存调度已实现；后续接入不能把内部 Proposal 接口直接暴露给前端。

[HS-02B 元素编辑与 HTTP](opm-hybrid-save-element-http-task-spec.md) 已交付 CREATE_ELEMENT/UPDATE_PROPERTY/UPDATE_LAYOUT、真实候选授权和 OPL/Trace 生成，以及 open/projection/text/capabilities/commands/receipts。JSON 字段局部回写保持原业务字段和 route_points；候选从 token 与实际模型重算。

[HS-02C Feature 与 State](opm-hybrid-save-owned-construct-task-spec.md) 新增 CREATE_FEATURE/CREATE_STATE/UPDATE_STATE/STATE_EXPLICIT/STATE_SUPPRESS/UNFOLD/FOLD，累计十类。State v2 名称按持久化收紧为 256 Unicode code point，拒绝无持久化字段 ordinal；owned occurrence 角色、Capability/version、owner locator 与 Context 均严格绑定。无损写回只修改本次字段；隐藏不删除 State/Fact，重新显示 Feature State 使用 FEATURE_STATE_NODE。

[HS-02D 关系与删除](opm-hybrid-save-fact-lifecycle-task-spec.md) 接入 CREATE_FACT/UPDATE_FACT/DELETE_CONSTRUCT，累计十三类；候选和删除影响均从实际草稿重算 Q/B/impact。覆盖 26 类基础关系和 8 类 Control 的代表性 HTTP/SQLite 闭环；同值更新保持端点 ID，Control 不新增关系，删除不产生逐编辑 Revision。condition/逻辑组高级参数、label_positions/junction_position、多 Context 删除明确拒绝，详见子规格。

[HS-02E 草稿查询](opm-hybrid-save-draft-query-task-spec.md) 接通 navigation/findings/relation-catalog，九条路径均读取真实草稿状态。导航按 Context 类型平铺，不推断不存在的父子关系；核心问题明确 MODEL 范围、INCOMPLETE 和稳定身份；目录有独立可空 selection_id 并引用 exact Profile 符号。查询零新增持久化记录，旧 token/资产错误明确拒绝。保存调度、双 checkpoint fallback、前端和生产模式切换仍待后继，不能视为全部 HS-02 完成。

复用领域校验、Profile 装配和文本生成；拆开“验证编辑”和“必定新建完整历史 Revision”的耦合。实现 resolved delta、原子 DURABLE 收据、draft token 并发守卫、草稿投影和文本来源身份。候选和 impact_token 全面迁移到 draft token，不留下旧 revision-only 授权路径。

实现 10 秒 Runtime scheduler、单模型串行协调、手动优先、去重、保存点物化、固定引用和收据查询。增量与派生内容能够在 exact binding 下从 checkpoint 恢复，错误时 fail closed。定时测试使用可控时钟，不依赖 sleep 10 秒。

[HS-02F 保存核心](opm-hybrid-save-coordinator-task-spec.md) 已交付 V4 检查点差量层、MANUAL/AUTO 事务、保存收据和协调器；内容去重不丢捕获元数据，覆盖只前进，保存不生成逐编辑 Revision。核心显式接入外部 executor，测试验证10秒期限、优先级、退避和恢复阻断；未启用运行中的用户模型。

[HS-02G 保存入口与历史](opm-hybrid-save-http-history-task-spec.md) 已接入真实校验、Save/SaveState、按模型懒注册宿主、OpenDraft 状态及新旧历史查询。保存点可通过 EXACT workspace/projection/text 读取，OPL 使用新 Revision 身份重新生成；无变化不增历史，AUTO 不入列表。旧 Profile/资产错误不放宽为成功；其交付时的 root-only 限制由 HS-02H 替代。

[HS-02H 多 Context 文本与保存](opm-hybrid-save-context-text-task-spec.md) 支持四种已物化 Context 的 OWNED 文本范围、按图 Fact 筛选、子图句子/Token/Trace 身份隔离及全部 Context 保存校验，保留根 golden 公式。任一子图失败或存在无 OWNED occurrence 的 Fact 都整笔阻断。必要端点仅有 REFERENCED/VIEW_DERIVED、PROFILE_CONTEXT 仍不支持；不推导细化树或新增多图编辑能力。Pin/Baseline/Export、启动模型发现、前端、用户库迁移和恢复容量留后继。

[HS-02I 固定版本 Pin](opm-hybrid-save-pin-task-spec.md) 接入精确捕获、用途隔离、耐久幂等和 revision-only 保留引用；MANUAL/PIN 共用显式 FIFO。V5 独立修正可空保留序号 CHECK，Pin 要求显式 V4+V5，不影响 V4 Save/AUTO；不在请求中迁移。EXACT 使用既有统一历史读取。Snapshot/Baseline/Export 业务消费者、前端复制永久链接和模式迁移仍未接入，不能将 purpose 当成业务实体完成证明。

### HS-03：前端保存交互

Active Playbooks：frontend-vue (primary)、testing。

使用机器生成的 v2 类型，实现保存按钮、Ctrl/Cmd+S、待发送 IndexedDB 队列、重开收据协调、保存状态、Header 草稿序号与历史列表。保存捕获点击之前的编辑队列，保存期间新增编辑仍可继续。OPD、文本、Finding 按 token 原子切换；过期请求不能覆盖新状态。

名称/标签输入先校验后保存，IME、不合法名称和未确认关系不能伪造已保存。禁用 IndexedDB/磁盘配额失败、网络失败、只读、多标签页均有明确反馈。HEAD URL 不增加 edit_seq，永久链接须等 Pin 成功；相应更新复制链接、Snapshot、Baseline 和导出调用点。

### HS-04：压缩、迁移联调与容量证明

[HS-04A受控副本激活](opm-hybrid-save-activation-copy-task-spec.md) 已交付PREPARED→ACTIVATED_COPY的独立输出、V4/V5迁移、模式事务和多Context回读验证；不会替换原库或证明live HEAD未变化。HS-03B工作台已接通已激活模型；正式在线迁移、专用V1升级错误、安装恢复、强停和容量仍待后继。该交付不能整体勾选HS-I02/HS-I08。

Active Playbooks：backend-springboot (primary)、db-migration、testing。

实现两检查点保护、100 步会话 Undo、保留引用和受控压缩；不删除手动保存点、精简收据或旧 Revision。验证 fallback checkpoint 与 journal 完整性；备份覆盖新的草稿表和引用内容。针对恢复/导出/发布的旧 Revision-only 消费者完成可用性检查；未适配消费者稳定拒绝新模式，不能读陈旧 HEAD 冒充最新。

按设计第 9 节执行单测、Java 集成、真实 Playwright、kill-point 和 20,000 次编辑容量对照。记录物理容量与行数、保存/恢复耗时；既有工程性能阈值不得放宽。所有模型迁移完成前保留 V1 读写兼容；新模式只能在该模型迁移验证成功后启用。

## 3. 验收 ID

| ID | 验收 | 切片 |
| --- | --- | --- |
| HS-I01 | Schema、canonical vectors、错误映射、生成代码一致 | HS-01 |
| HS-I02 | 迁移与双模式守卫、旧 EXACT 内容等价、备份恢复 | HS-01/04 |
| HS-I03 | DURABLE 原子性、响应丢失重试、并发冲突与恢复 | HS-02 |
| HS-I04 | 10 秒不重置、无变化不写、手动优先及在途新编辑 | HS-02/03 |
| HS-I05 | 双 OPD、布局、实时 OPL/Trace 同 token、候选失效 | HS-02/03 |
| HS-I06 | 保存按钮/快捷键、IME、失败保留、队列重开 | HS-03 |
| HS-I07 | 手动历史、恢复面板、永久链接/Snapshot/Baseline 保护 | HS-02/03/04 |
| HS-I08 | 压缩强停、Undo 窗口、收据保留及容量对照 | HS-04 |

## 4. 验证、完成和回滚

先按实际机器契约增加定向 schema/vector 测试，再执行 Web 单测/lint/typecheck/build、Java 定向测试和独立临时数据库的 Playwright；迁移和恢复必须以真实 SQLite 事务与强停观测验证。命令和执行结果写入实现 Checklist，不预先标记通过。

全部 HS-I01~08 通过、无新旧协议双写、实测完整 Revision 增量与编辑数解耦后才能宣称本功能完成。不要求为了该任务生成生产 Activation 或改动已安装发布根。

代码回退只回本任务增量。迁移前失败保持旧模式；切换后不允许旧程序直接写入，使用新程序导出/备份后前向修复。恢复迁移前备份必须保留当前副本并明确缺少后续编辑，不自动破坏用户数据。
