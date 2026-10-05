# HS-02D 关系与删除草稿命令

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，已实现并通过定向验证（2026-09-14）。上位：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)。当前目录实施，保留已有差异，不使用 worktree、不提交、不迁移用户库。实际命令、边界和完整文件集合见 [实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。

## 1. 范围

接入 CREATE_FACT、UPDATE_FACT、DELETE_CONSTRUCT，累计 13 类命令。复用现有 16 Procedural/10 Structural/8 Control 目录与语义验证，不新增 Capability。仍只编辑根 Context；本轮删除仅支持单 Context 模型，多 Context 删除返回 CONTEXT_NOT_ALLOWED，不能把不完整的细化影响当完整级联。三条查询、保存调度、UI/模式切换留给后继。

允许本规格、总实施规格、总设计和实施 Checklist；主 Java `application/{LocalApiService,StructuralLinkCatalog,DraftWorkspaceService,DraftFactEdits}.java`、`api/DraftCapabilityIdentity.java`；测试 `api/{DraftWorkspaceControllerTest,DraftCapabilityIdentityTest}.java`；`scripts/{generate-draft-workspace-contract,draft-workspace-contract.test}.mjs` 及既有五份生成输出。Java 根沿用 `services/local-runtime/src/{main,test}/java/org/opm/localruntime/`。不改 SQLite、依赖、旧 v1 wire 形状、Profile、用户库、发布工件和 `.harness`。

执行前发现并修正的目录冲突：CAP-ISO-STRUCT-004 的四份 active 0.2.0 reciprocal PASS fixture 均固定 direction=UNDIRECTED，而旧 Runtime Catalog 误用 BIDIRECTIONAL。本包将共享目录改为 UNDIRECTED，与实际互惠单句模型一致；不修改图形双端 harpoon，不将互惠改为两句。v1/v2 候选均使用修正后的唯一方向，旧已保存模型仍可读取；不改 Profile bytes 或 wire enum。

## 2. 唯一授权

关系候选只复用纯目录/端点归一化，不调用 v1 查询或构造旧 Revision 授权。scope.endpoints 保留顺序和重复，接受根 Context 中可见的语义 ID 或 occurrence；转换为语义目标再归一化。UPDATE_FACT 空 endpoints 使用当前 Fact 端点，允许已有 Fact 引用的隐藏 State；显式 endpoints 必须可见。selected Fact 必须在本 Context。CREATE_FACT selection 必须 null；DELETE 仅接受本 Context occurrence 和空 endpoints。

所有输出移除 expires_with_revision，按 HS-01D Q/B 公式重算 query/option。删除 impact_token 严格采用 DraftDeleteImpact/1 公式；在写事务内重算候选并校验 enabled、query、option、target、mode、impact。新增封闭 reason_code=IMPACT_TOKEN_STALE，错误 target/mode/token 返回 DRAFT_EDIT_REJECTED/422，旧 draft token 仍优先返回 DRAFT_CONFLICT/409。禁用 DELETE_TARGET 不能绕过依赖，CASCADE 必须选择独立候选。旧 v1 授权保持原入口，通过与 v2 共用的纯领域变更函数执行。

CREATE/UPDATE 的 normalized_endpoints 若提供，必须逐项匹配候选 role/target kind/id/ordinal/state_qualification；可选 occurrence locator 必须匹配该端点及 Context。Capability 可选 version 精确等于 active Profile。UPDATE 不改变 Fact Capability；Control 只使用其专属选项附加完整 modifier 对，移除使用专属 Remove 选项且 replacement 仅 modifiers=[]，不创建新 Fact。

基础选项仅允许目录声明的 modifiers；不能借基础选项添加/移除 Control。Structural 方向/标签/fan 完整性使用原领域规则；Procedural 方向必须 DIRECTED。暂不支持 condition；CREATE logical_groups 必须为空，UPDATE 不接受 logical_groups（包括空列表，不能忽略清除既有分组的意图），稳定 DRAFT_EDIT_REJECTED/COMMAND_NOT_IMPLEMENTED；Procedural 非空 labels、非适用完整性和 Structural 非空 modifiers 拒绝。CREATE occurrence 只 OWNED 且精确 PROCEDURAL_LINK/STRUCTURAL_LINK。本轮布局接受 x/y/route_points，label_positions/junction_position 明确拒绝（COMMAND_NOT_IMPLEMENTED），不声称完整布局 API 已接入。

## 3. 无损正文与影响

创建只追加 Fact/Occurrence/Layout 及 Context occurrence_ids；route_points 从原 payload 写入。更新只修改请求中明确出现且适用的端点/方向/modifier/标签/完整性，不重写原文其他字段。端点语义不变时保留 endpoint_id 与可选字段；有变化时只为新端点分配身份。无变化保持原始 bytes 语义，不增加 Journal。真实变化经完整模型校验、Profile/OPL/Trace 生成后原子提交。

删除复用领域依赖闭包，但不复用旧 impact token。影响包含语义目标及 occurrence、受影响 Context，以及本次重新生成的当前 OPL sentences/Trace。Context/OPL/Trace 的 DIRECT 表示更新/重算，不删除 Context；FINDING 为当前核心校验的真实结果，核心校验通过时数量零，coverage 仍 INCOMPLETE。先验证当前模型并真实生成文本，再构造影响；不读旧 Revision 的文本索引冒充草稿证据。DELETE_TARGET 的阻断仅由语义/occurrence 依赖决定，派生重算不新增级联阻断。

写回按 ID 删除目标及对应 occurrence/layout/presentation，过滤 owner/context ID 列表，保留其他原始字段。REMOVE_OCCURRENCE 不删语义目标；不能移除唯一 owned occurrence。Fact 删除连同自身 modifiers，OPL/Trace 重新生成。所有失败及取消零 Journal/部分删除；重试用耐久 receipt，过期 token 返回 DRAFT_CONFLICT。

## 4. Plan 与验收

先分离旧关系/删除授权与纯变更 → 草稿候选和影响 owner → 局部正文写回 → HTTP/SQLite 回归。

- HS-F01：Procedural/Structural 创建、State 端点、fan、Self-invocation、标签/方向/完整性正反例；实际 OPL/Trace 和重开一致。
- HS-F02：关系更新、Control 附加/移除、重复操作无变化；原始端点身份、语义元数据/几何保持。
- HS-F03：所有可选参数要么实际持久化要么稳定拒绝；端点/角色/locator/Capability/option/Context 伪造、独立 Control、过期 token 零写入。
- HS-F04：Fact/State/Feature/Element 的删除、依赖阻断、显式级联、REMOVE_OCCURRENCE、impact 篡改和重试；派生影响计数与实际身份闭合。
- HS-F05：既有 v1、草稿、Journal/摘要测试及生成器/类型检查通过；不启动浏览器、不切换用户库，不能当作生产保存验收。

回滚只撤回本包修改，不降级数据库、不恢复覆盖前序用户差异。完整文件清单和实际命令写入实施 Checklist。
