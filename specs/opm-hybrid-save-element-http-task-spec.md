# HS-02B 草稿元素编辑与 HTTP 接入

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，首批元素编辑与 HTTP 已实现并通过定向回归（2026-09-13）。上位规格：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)。直接当前目录开发，保留前序差异。完整清单与命令结果见 [实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。

## 1. 目标、范围与边界

实现已激活 V2 模型的 open/projection/text/capabilities/commands/receipts 六条真实 HTTP 路径。命令首批为 CREATE_ELEMENT（Object/Process）、UPDATE_PROPERTY（Element name）、UPDATE_LAYOUT（既有 owned Object/Process/Attribute 范围）。其余命令及 navigation/findings/relation-catalog 显式拒绝，reason_code=COMMAND_NOT_IMPLEMENTED；不得借 v1 回退或把实现缺失说成 Profile 禁用。本切片不交付保存 scheduler/保存按钮/模式激活/生产证据。

允许修改：本规格、混合保存总设计/总实施规格/实施 Checklist；`application/LocalApiService.java`（提取无存储的元素操作及 projection data，保持 v1 行为）；`storage/DraftJournalRepository.java`（同一读快照补齐 checkpoint token/最近 MANUAL ID）；`api/ApiWebConfiguration.java`；`scripts/generate-draft-workspace-contract.mjs` 及其五份既有生成物；`scripts/draft-workspace-contract.test.mjs`（同步历史 handler 状态断言并补候选摘要 parity）。

允许新增 Runtime `application/DraftWorkspaceService.java`、`api/{DraftCapabilityIdentity,DraftWorkspaceController,DraftWorkspaceExceptionHandler,DraftWriteRequestGuard}.java`、`semantic/DraftTextMetadataWriter.java`；测试 `storage/DraftWorkspaceTestDatabase.java`、`api/{DraftWorkspaceControllerTest,DraftCapabilityIdentityTest}.java`。上述 Java 均位于 `services/local-runtime/src/{main,test}/java/org/opm/localruntime/`。

禁止修改 SQL、默认迁移资源、用户库、前端行为、Profile 资产、依赖、发布工件、旧 v1 wire 和 `.harness`。API 只打开已存在项目 DB，不调用自动迁移 open()。测试仅临时真实 SQLite 显式迁移/激活。

## 2. 领域与无损正文

使用已验证完整 JSON 作为唯一正文；SemanticRevision 仅计算视图。从 v1 提取并复用创建元素、名称校验和布局校验，不调用 v1 edit/Revision committer。V2 计算视图保留内部 seed revision identity，不新增 revision ID/sequence。候选及编辑只支持当前 Runtime active binding；其他 binding 返回 RULE_VERSION_CONFLICT。

草稿 raw parser 用 binary64 保留数值和负零；旧 SemanticRevisionReader 要求整数词法。计算视图的独立副本只将 revision_sequence、layouts[].z_order、facts[].endpoints[].ordinal 转为整数节点，原正文和几何坐标不变。现有 DTO 为 Java int，超出该计算范围须返回 DRAFT_EDIT_REJECTED，不截断、不放宽 DTO，也不误报存储失败。

CREATE_ELEMENT 只追加新 Element/Occurrence/Layout，以及根 Context.occurrence_ids；Writer 只序列化新增项，禁止覆盖已有项。UPDATE_PROPERTY 只写匹配 Element.name.local_name，名称非空白、最多 256 Unicode code point，保留空格且不要求唯一。同名是 UNCHANGED。UPDATE_LAYOUT 只写匹配 Layout.x/y；保留 width/height/z_order/route_points、optional 存在性及负零。当前保存正文 Schema 不接受 label_positions/junction_position，本切片不扩大该正文契约。

每次真实变化先完整 Schema 与 SemanticRevisionValidator 校验，再使用 exact ProfilePackageAssembler 资产生成 OPL/Trace，并执行 validateActiveWriteEvidence，成功后写 Journal 事务。文本元数据按现有 MS-REV-001 text_artifact/text_traces 形状序列化，摘要复用生成服务；仅供 token 绑定的内部草稿，不作为 seed 历史版本的发布文本。旧 revision_digest/validation_summary 属 seed 元数据，不对外冒充新草稿校验证据；编辑结果的 validation_summary 是实际核心检查结果，coverage_state=INCOMPLETE（并未完成全部 Profile 符合性）。任何生成/验证失败零增量、零收据；无内容变化保留原派生元数据。

## 3. 候选与授权

沿用 HS-01D 的 Q/B/H 唯一公式，由 DraftCapabilityIdentity 复用 DraftEditRequestIdentity 的 binary64 编码；不另造摘要。所有选项从当前模型和 exact Profile 生成，包含真实 Symbol/Template/Rule raw digest。根 Context 以外本切片返回 CONTEXT_NOT_ALLOWED；端点列表必须为空。

现有 ProfilePackageAssembler.capabilities 仅收录具有 Rule/Symbol/Template 三元组的关系，不能用它查询核心节点。冻结核心映射：CAP-OBJECT-001→symbol.object.basic、CAP-PROCESS-001→symbol.process.basic、CAP-FEAT-ATTRIBUTE-001→symbol.feature.attribute。候选需验证该 Symbol 在已验证 Catalog 中真实存在；template_family 和 rule_refs 分别引用 exact Grammar/RuleSet 整资产 ID/version/digest（沿用核心节点既有语义），不伪造不存在的独立 Object/Process 句式。只有当前 active binding 可使用这张核心映射，不因此修改 Profile bytes 或能力启用状态。

CREATE_ELEMENT 要求 selection_id=null，返回 Object/Process 两个选项；UPDATE_PROPERTY 接受当前 Context 的 Element occurrence 或该 Context 可见 Element ID，返回该 Element 的唯一名称选项；UPDATE_LAYOUT 只接受该 Context 中符合既有布局规则的 occurrence ID。无匹配选择返回 ENDPOINT_KIND_MISMATCH。allowed 只含本次 intent 的真实可执行命令；不可用项写 forbidden，不伪造 enabled option。

编辑在 Repository 的 BEGIN IMMEDIATE 内重建候选，逐项匹配 query/option；CREATE 的 kind 必须对应选项 Capability，改名的 target ID、移动 occurrence ID 必须等于 Runtime 选项目标。不能借另一个合法候选修改任意目标。幂等收据优先于再次执行 effect/授权，保持 HS-02A 重试顺序。

## 4. HTTP、查询与错误

原始请求以 String 接收，严格 Schema 解码后进入服务；不能先 Map 解析而丢弃重复键/负零。结果亦须通过 Schema。不完整或 malformed body 为 INPUT_INVALID/400。独立 v2 guard 复用既有 Host/Origin/Session 检查，失败转换为新增 LOCAL_SESSION_INVALID/403（reason_code=null），不改变 v1 ErrorEnvelope。失败响应使用既有 DraftError，未知内部故障稳定为 PERSISTENCE_FAILED/503，不泄露 SQL/路径/堆栈。

open 在同一 Repository 读事务取得实际 token、checkpoint token、最近 MANUAL revision、dirty_since/deadline；scheduler 尚未装配，in_flight=NONE、pending_manual_target/last_error=null。不自动切模式。其他查询使用同一恢复快照核对 token/context 后计算，meta 绑定该 token；后续并发修改不会把此结果标为新 token。projection 从共享计算函数产生 data，并从原始 Layout 补齐几何字段、从原始 Fact 补齐 state_qualification，避免 DTO 有损。

text 从当前快照及 exact 资产生成并验证，不查询 seed 的历史 text_index。receipts 复用耐久 owner。三条尚未实现的查询及未实现命令返回 DRAFT_EDIT_REJECTED/422 + COMMAND_NOT_IMPLEMENTED；没有隐式降级。

## 5. Plan、验收和回滚

顺序：共享纯领域函数与无损回写 → 候选身份及 service → v2 guard/controller/advice → 临时库真实 MockMvc 回归。边界先在 Checklist 确认。

- HS-E01：真实 HTTP 创建 Object/Process、改名、布局，token 递增与重开；revision/content/checkpoint 行数不增长。
- HS-E02：所有授权在真实快照复算；伪造 option/跨目标/旧 token/错误 binding/未实现命令/错误 Context 均零写入；改名重生成已有 Fact 的 OPL/Trace。
- HS-E03：同名/同布局 UNCHANGED，响应丢失重试、相同 ID 不同请求、收据读取；dirty deadline 不随连续编辑延后。
- HS-E04：保留模型描述、Element essence、布局路径等原始字段及负零；文本/资产失败回滚，重新创建服务重开一致。
- HS-E05：Host/Origin/session 缺失或错误、raw 重复键/尾随/未知字段拒绝；所有响应严格符合 v2 Schema；v1 回归及生成检查通过。

回滚只移除本包新增接入、恢复共享函数提取及文档，不回退前序差异，不运行数据库降级/删除。切片测试不是默认模式启用或浏览器验证。
