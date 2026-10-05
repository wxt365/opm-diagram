# HS-02E 草稿导航、问题和关系目录查询

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，已实现并通过定向验证（2026-09-14）。上位：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)。

## 1. 目标与边界

接通 navigation/findings/relation-catalog，九条草稿 HTTP 路径均有真实实现。只读取一次 Journal snapshot；所有结果绑定该 DraftToken，不读旧 Revision 的 finding_index 或文本索引，不新增 Journal、receipt、Revision、checkpoint。当前目录开发，保留前序差异，不提交。

允许修改本规格、总实施规格、总设计、实施 Checklist；scripts/{generate-draft-workspace-contract,draft-workspace-contract,draft-workspace-contract.test}.mjs 及其五份既有生成输出；tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json；Java application/{LocalApiService,DraftWorkspaceService,DraftWorkspaceQueries}.java、api/{DraftWorkspaceController,DraftWorkspaceSchema,DraftCapabilityIdentity}.java 及测试 api/{DraftWorkspaceControllerTest,DraftWorkspaceContractTest,DraftCapabilityIdentityTest}.java。Java 根为 services/local-runtime/src/{main,test}/java/org/opm/localruntime/。Finding 身份入口放在既有 api.DraftCapabilityIdentity，复用包内数字 encoder，不将内部 encoder 扩展为公共 API。

禁止修改 SQL、用户库、Profile bytes、v1 wire、前端交互、依赖、发布证据和 .harness。保存调度、模式激活、完整校验引擎、多层导航关系、浏览器验收不属于本包。

同时允许在前驱 opm-hybrid-save-draft-workspace-contract-task-spec.md 同步关系目录请求表项和查询结果的后继覆盖说明，避免保留两个冲突的活动 wire。

## 2. 请求与共同守卫

navigation/findings 继续使用 DraftQueryRequest。relation-catalog 使用独立 DraftRelationCatalogRequest，必填且仅含 request_id、draft_token、context_id、selection_id；selection_id 为 StableId 或 null，缺失不等于 null。生成 Schema/OpenAPI/TS/Java 同步，v2 仍为尚未启用的 0.2 draft，v1 不变。

所有五条只读查询先校验请求类型、项目/模型，再读取 snapshot：binding digest 不符优先 RULE_VERSION_CONFLICT/409；token 不符 DRAFT_CONFLICT/409；Context 不存在 NOT_FOUND/404；snapshot binding 不等于 Runtime active binding 返回 RULE_VERSION_CONFLICT/409。之后装配 exact Profile；资产错误沿既有 DRAFT_EDIT_REJECTED/422，不回退旧版本。

关系 selection 非 null 时必须是当前 Context 可见的语义 Fact ID 或 Fact occurrence ID；其他节点、异图或不存在的 ID 返回 NOT_FOUND/404。null 返回完整目录并禁用 Control。目录表示入口可用性，不是端点/参数授权；提交仍必须取得真实 capabilities 候选。

## 3. 导航与目录

Context 持久化没有 parent 字段，禁止推断细化树。导航为平铺分组：SYSTEM_DIAGRAM/PROCESS_REFINEMENT 放 process_tree，OBJECT_REFINEMENT 放 object_forest，MODEL_VIEW/PROFILE_CONTEXT 放 views。组内按 context_id 升序，每项准确使用存储名称/类型，has_children=false；current_path=[当前 context_id]，不是推断的祖先路径。

关系目录复用旧入口的纯目录构建函数；旧入口继续负责自身 Revision 授权。固定 16 Procedural/8 Control/10 Structural，按族和 Capability 排序。v2 每项从 exact assets.capability 取得 symbolRef，并以当前 SymbolCatalog 的 version/digest 替换旧硬编码身份；缺 Capability/符号拒绝整个结果。非根 Context 全禁用 CONTEXT_NOT_ALLOWED。根 Context 的 Control 依据现有 ControlLinkCatalog.forBase 判断，未选 Procedural Fact 为 CONTROL_REQUIRES_BASE_FACT，不适配基础关系为 MODIFIER_COMBINATION_INVALID；不创建第二条关系、不启用生产 Capability。

## 4. 当前问题列表的唯一口径

DraftFindingsData 改为封闭对象：{items, validation_scope:"MODEL", validation_summary}。items 是本次 SemanticRevisionValidator 全模型结果，禁止伪装成完整 Profile/ISO 校验。每项字段：finding_id、rule_id、severity="BLOCKING"、category=核心 code、context_id=null、entity_id=原 locatorId、message=原 message。context_id=null 明确没有唯一 Context 归属，meta.context_id 只代表调用视图，不将全模型问题错误归属到该图。category 为 SemanticValidationCode 的九个枚举。

先按 (code,locatorId,message) 去重，按这三字段的 UTF-16 顺序排序。rule_id="rule.core."+code。finding_id="finding.draft."+SHA256(JCS(encode(preimage)))，encode 复用 DraftEditRequestIdentity 的全数字 binary64 编码；preimage 精确字段为 identity_version="DraftFinding/1"、project_id、model_id、draft_token、code、locator_id、message。不含 request_id、查询 Context、时钟或旧 revision_id；相同模型/token/问题跨请求和跨图身份相同。

validation_summary 固定 blocking=items.length、warning=0、suggestion=0、coverage_state="INCOMPLETE"；Node/Java decoder 同时强制计数和 finding_id 唯一。无核心问题时真实生成当前 Context 的 OPL/Trace 并验证 active evidence；生成失败返回既有 422，不能输出伪造空列表。有核心问题时直接返回诊断，不尝试对损坏模型生成文本。Profile 装配始终先完成。

Node/Java 固定 parity 输入：project.test、model.test、token={draft_id:"draft.test",edit_seq:7,binding_digest:64 个 a}、code=MISSING_REFERENCE、locator_id=state.test、message="state owner does not exist"。预期 finding_id=finding.draft.3ba9af5cae522243733e9544aa3698a68ba9323b894ddcf80ea96347c7b73df5。

## 5. Plan、验收与回滚

先补封闭请求/结果和两端不变量 → 抽纯目录 owner → 绑定 snapshot 查询 → HTTP/SQLite 与两端协议回归。

- HS-Q01：平铺多 Context 名称/分组/顺序真实，未知 Context 拒绝；不伪造子图树。
- HS-Q02：34 项与 exact Symbol refs，null/Fact/occurrence/Structural selection、Control 和非根 Context 正反例。
- HS-Q03：全模型真实问题、稳定 ID、去重排序、INCOMPLETE 和计数不变量；空结果须真实完成文本验证。
- HS-Q04：修改后旧 token 拒绝，新 token 读取当前数据；重开一致；缺资产/绑定错/错请求形状/非法 selection 拒绝；所有查询零新增写入。
- HS-Q05：v1 目录回归，Java/Node 生成物与协议测试、Web typecheck、diff 检查通过。无用户库激活和浏览器证据。

回滚仅撤回本包文件差异并用旧 generator 还原对应生成输出，保留前序变更；不降级/覆盖数据库。实际命令和完整清单记入 [实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。
