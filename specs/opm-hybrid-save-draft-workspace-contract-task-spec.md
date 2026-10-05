# HS-01D 草稿编辑与查询契约

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，协议生成、严格解码与请求摘要已实现并通过定向验证。上位规格：[混合保存实施任务](opm-hybrid-save-strategy-implementation-task-spec.md)。Git 基线沿用 `2180f3823a547878f15c6dd2d2b11030718a0efa`，在当前目录保留已有差异，不使用 worktree。

## 1. 目标及非目标

补齐独立 v2 编辑、打开草稿、投影、文本、导航、Finding、目录、候选与收据的封闭机器契约、TypeScript 类型和 Java 严格解码器。同步冻结候选身份、幂等与跨字段校验，消除 revision-only 授权和任意 Map 载荷。

本切片不装配 HTTP handler，不启用 V3，不写用户库，不宣称 DURABLE 事务、自动保存、UI 或故障恢复已实现。旧 LocalApiService 每次编辑创建 Revision，且其 DTO 有损，后继实现不得直接包装旧 edit()/writer 冒充草稿路径。

## 2. 路径、读取与结果

统一根 `/api/v2/projects/{project_id}/models/{model_id}/draft`。复用本地 session、Origin/Host 安全边界；不开放公网权限角色。

| 后缀/方法 | operationId | Request / Result |
| --- | --- | --- |
| `/open` POST | OpenDraft | OpenDraftRequest / OpenDraftResult |
| `/projection` POST | QueryDraftProjection | DraftQueryRequest / DraftProjectionResult |
| `/text` POST | QueryDraftText | DraftQueryRequest / DraftTextResult |
| `/navigation` POST | QueryDraftNavigation | DraftQueryRequest / DraftNavigationResult |
| `/findings` POST | QueryDraftFindings | DraftQueryRequest / DraftFindingsResult |
| `/relation-catalog` POST | QueryDraftRelationCatalog | DraftRelationCatalogRequest / DraftRelationCatalogResult |
| `/capabilities` POST | QueryDraftCapabilities | DraftCapabilitiesRequest / DraftCapabilitiesResult |
| `/commands` POST | ExecuteDraftEdit | DraftEditRequest / DraftEditResult |
| `/receipts` POST | GetDraftReceipt | DraftReceiptRequest / DraftReceiptResult |

POST 查询只是携带完整结构化 token，不产生编辑/Revision。保存三条既有路径保持不变。OpenDraft 仅打开已激活 V2，不隐式迁移；输入 request_id 和 nullable context_id，null 选根 Context。返回 project_id/model_id/root_context_id/context_id、actual token、SaveState、mode=JOURNALED_DRAFT_V2。其他查询必须携带 exact draft_token/context_id；在同一一致读视图中验证当前 token，再产生结果，禁止自动换成较新 token。查询结果的 meta={request_id,draft_token,context_id}，data 分别为封闭投影/文本/导航/Finding/目录/候选；不出现 input_revision、committed_revision 或 freshness=current 的旧包装。前端仅合并相同 token 和 context 的结果。

本版普通查询与授权仅接受当前 token；过期返回 DRAFT_CONFLICT。历史保存点和固定引用继续走真实 Revision API，不能从任意过期草稿 token 打开历史。编辑收据持久保留，查询不要求旧 token 仍在恢复窗口；SAVE/PIN 捕获 token 的保留规则由保存调度切片实现。

查询 wire 由 [HS-02E](opm-hybrid-save-draft-query-task-spec.md) 补充并优先适用：关系目录使用独立 DraftRelationCatalogRequest，selection_id 必填且可为 null；其余普通查询不接受 selection_id。DraftFindingsData 从旧数组改为 {items,validation_scope:"MODEL",validation_summary}，核心问题项携带 message，context_id=null，覆盖状态固定 INCOMPLETE 且计数与 items 一致。旧数组形状仅为 HS-01D 历史输入，不再作为活动 0.2 wire。

## 3. 命令、候选和幂等

DraftEditRequest={request_id,command_id,expected_draft_token,scope,authorization,command}。scope={context_id,selection_id,intent,endpoints}，selection_id 必填 nullable，endpoints 保序且允许重复（Self-invocation）；intent 与 command.command_type 相等。authorization={capability_query_id,selected_option_id}，所有 13 类命令一律从候选取得授权。复用 v1 的 13 个结构化 payload，移除 payload 内重复的 capability_query_id/selected_option_id；其余可选字段继续保持存在性，不以 null 替代缺失。拒绝 legacy Consumption 快捷 payload、四种任意 Map 命令和独立 Control Fact 创建。

候选结果保留 Runtime 的 normalized_endpoints、参数、符号与理由；expires_with_revision 改为 expires_with_token。ImpactSummary.input_revision 改为 input_token。候选 ID 及 impact token 必须由后继应用服务基于 project/model、整个 draft token、scope 和 exact option/impact 重算；禁止以旧 revision、目录名或前端 endpoint 推断替代。所有 option 的 query ID、expiry token、delete impact token 必须属于本次查询；DELETE 专属四字段仅 DELETE option 必须存在。payload.context_id 若存在须等于 scope.context_id，DELETE selection_id 同理。

编辑处理顺序：本地安全边界 → 严格 Schema → request digest 与幂等收据 → V2 模式/绑定/expected token → 重算候选及业务校验 → 原子 journal、派生增量、stream、receipt → 返回。重复 command_id 且相同业务请求返回原结果（仅 request_id 重新相关），不因旧 token 过期再次编辑；不同请求返回 IDEMPOTENCY_MISMATCH。结果包含 request_id/command_id、status=DURABLE|UNCHANGED、base_token/result_token、content_digest、affected_ids/text_trace_ids/validation_summary；无变化不增加 edit_seq，但同样写耐久幂等收据。DURABLE 的序号严格加一且不溢出；UNCHANGED 的 token 完全不变。

请求摘要的唯一前像为 `{identity_version:"DraftEditRequest/1",project_id,model_id,command_id,expected_draft_token,scope,authorization,command}`；排除 transport request_id，其余不省略。递归保持数组顺序/可选字段存在性，所有 JSON number 先替换为 `{binary64:<16位小写大端hex>}` 后交给既有整数 JCS owner，UTF-8 SHA-256。该对象只存在摘要前像中，原命令及 modifier 不允许任意 object 值，不能作为 wire fallback。Node/Java 必须使用同一 raw vectors 验证 -0、Unicode、几何、scope 和 request_id 的影响。不是 SaveContentDigest，不改变保存去重算法。数字按 JSON binary64 解释，安全整数边界由各字段 Schema 约束；Java 必须从原始数字词法读取，不能将 -0 先经过整数转换。

候选生产与提交复算由 HS-02 实现，唯一公式在此冻结。令 H 为上述“全部数字 binary64 → JCS → SHA-256”过程，Q={identity_version:"DraftCapabilityQuery/1",project_id,model_id,draft_token,scope}。capability_query_id=`query.draft.`+H(Q)。令 B 为完整 option 删除 capability_query_id、option_id、impact_token 三字段后的封闭对象（其余字段包括 expires_with_token、删除 impact_summary 均保留）；option_id=`option.draft.`+H({identity_version:"DraftCapabilityOption/1",query_id:capability_query_id,body:B})。DELETE 的 impact_token=`impact.draft.`+H({identity_version:"DraftDeleteImpact/1",query_id:capability_query_id,option_id,impact_summary})。先算 Q，再算 option，最后算 impact，消除循环；普通 option 不含 impact_token。服务须从同 token 的实际模型/规则重建 B 和 impact，再逐字段比对，不能仅验证前端自己算出的 hash。HS-01D 解码器只验证形状与 token/context 关联，不冒充完成模型授权或这三类生产器。

GetDraftReceipt 按 operation=EDIT|SAVE|PIN 与 idempotency_id 查询，NOT_FOUND 时 request_digest/result 必须为 null，FOUND 时两者必须存在且结果 union 与 operation 一致，idempotency_id 与对应 result ID 相等。不存在不意味着可用新 ID 重发。READ_ONLY_REVISION=403，NOT_FOUND=404，INPUT_INVALID=400，DRAFT_CONFLICT/RULE_VERSION_CONFLICT/IDEMPOTENCY_MISMATCH/DRAFT_MODE_REQUIRED=409，DRAFT_EDIT_REJECTED=422，PERSISTENCE_FAILED/DRAFT_RECOVERY_REQUIRED=503；错误体 code/message/retryable/reason_code（nullable）。

## 4. Owner 与边界

`scripts/generate-draft-workspace-contract.mjs` 固定 wire 定义、v1 选定 Schema 的闭包和窄转换。只导入明确 roots，所有 object 递归封闭，整数限制安全范围，unknown Schema keyword 必须拒绝，不能静默生成弱校验。输出 Schema 是可复核生成物，不手改。投影补全现有 Runtime 的 owner_target_kind、endpoint、symbol/occurrence/layout refs 和几何字段；不引入任意 attributes Map。生成 `--check` 比较所有输出。

Java 使用生成的受校验 JSON 文档包装器，保留 optional 存在性与 binary64 -0，禁止先解成有损 DTO。入口严格拒绝未知/缺字段、重复键、尾随内容、类型强制转换、非有限值；返回 defensive copy。类型形状由同一生成 Schema 校验，不使用无校验 Map。TypeScript 输出完整判别 union；schema 正确不代替 Runtime 权限和业务校验。

允许文件：本规格、上位规格、保存设计和实施 Checklist；新增 generator、`scripts/draft-workspace-contract{,.test}.mjs`、`docs/contracts/schemas/opm-draft-workspace-v02.schema.json`、`docs/contracts/openapi/opm-draft-workspace-v02.json`、`apps/web/src/shared/api/generated/draftWorkspaceContract.ts`、`services/local-runtime/src/main/java/org/opm/localruntime/api/{DraftWorkspaceSchema,DraftEditRequestIdentity}.java`、`api/generated/DraftWorkspaceContract.java`、对应 `api/DraftWorkspaceContractTest.java`、`src/main/resources/draftsave/draft-workspace-v02.schema.json`、`tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json`。必要时在这些文件中复用既有 Projection/JCS owner，不改它们。禁止修改 v1 wire/handler、SQL、依赖、配置、Profile、用户数据和发布工件。

## 5. Plan、验收与回滚

顺序：生成封闭 wire 和 TS/Java 入口 → 严格解码与跨字段守卫 → 双端 request digest → 定向回归。HS-D01：13 命令正例、错 payload/legacy/unknown 拒绝；HS-D02：九条查询/命令/收据路径、token 与 context 闭包、删除条件；HS-D03：重复/尾随/unsafe/nonfinite/-0、嵌套未知字段、optional 存在性；HS-D04：相同 raw vectors 两端摘要 parity、transport ID 不影响摘要；HS-D05：generator --check、OpenAPI、Web typecheck、既有保存和摘要回归。

Checklist 先记录边界，再 Build；只以实际执行结果标记验收。回滚只移除本切片新增协议和引用，保留前序全部差异；没有运行数据库回退。
