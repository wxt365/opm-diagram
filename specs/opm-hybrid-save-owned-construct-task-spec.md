# HS-02C Feature 与 State 草稿命令

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，已实现并通过定向验证（2026-09-14）。上位：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)。在当前目录保留已有差异；不使用 worktree、不提交、不迁移用户库。实际命令与完整文件集合见 [实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。

## 1. 范围

接通 CREATE_FEATURE、CREATE_STATE、UPDATE_STATE、STATE_EXPLICIT、STATE_SUPPRESS、UNFOLD、FOLD 七类草稿命令。连同 HS-02B 共十类；CREATE_FACT/UPDATE_FACT/DELETE_CONSTRUCT、三条未接查询、保存调度、前端和模式切换仍为后继。本轮不修改 SQLite/依赖/Profile bytes/发布工件/旧 v1 wire。

精确允许：本规格、总实施规格、保存总设计、实施 Checklist；主 Java `application/{LocalApiService,DraftWorkspaceService}.java`，新增 `application/DraftOwnedConstructEdits.java`；测试 `api/DraftWorkspaceControllerTest.java`；`scripts/{generate-draft-workspace-contract,draft-workspace-contract.test}.mjs` 和 generator 的既有五份输出（Schema/OpenAPI/TS/Java/资源镜像）。Java 根沿用 `services/local-runtime/src/{main,test}/java/org/opm/localruntime/`。禁止修改 `.harness`、用户数据和前序无关差异。

## 2. 先修正的字段边界

当前 State 持久化 name.local_name 最多 256 Unicode code point，且无 ordinal 字段。v2 CreateStatePayload.name_or_value 与 UpdateStatePayload.changes.name_or_value 收紧为 256；从 v2 changes 删除 ordinal，携带时 INPUT_INVALID/400，不静默忽略。v1 Schema 保持。空白名称在草稿应用层拒绝，名称不 trim、不增加唯一性规则。

CREATE_FEATURE/STATE 的 occurrence 只能 OWNED，construct_role 必须分别为 ATTRIBUTE_NODE/OPERATION_NODE/STATE_NODE/FEATURE_STATE_NODE；错误返回 DRAFT_EDIT_REJECTED/422。capability_ref 必须匹配所选候选，若带 version 必须等于 active Profile version。owner_ref/expected_owner_ref 若包含 occurrence_id，必须确实定位该 Context 的该 owner，不能只比较 target_id。两个创建的 context_id 必须与 scope 一致；不一致沿既有 wire invariant 返回 INPUT_INVALID/400，进入应用授权前拒绝。

## 3. 候选与授权

沿用 HS-02B 根 Context、空 endpoints、exact token/active binding 和 Q/B 摘要。不修改候选/收据 wire。

- CREATE_FEATURE：选中当前 Context 的 Object/Process（语义 ID 或 occurrence），返回 Attribute/Operation 两个候选，normalized endpoint role=FEATURE_OWNER。
- CREATE_STATE：选中可见 Object 或 Attribute/Operation，按既有 Feature State owner 规则返回一个候选，role=STATE_OWNER；Process 不允许。
- UPDATE_STATE 及四类 presentation：选中当前 Context 可见 State，或该 Context 明确 SUPPRESSED 且 owner 在此 Context 可见的 State ID；过期 occurrence 不作为隐藏 State 的 locator。选项 role=STATE_TARGET。UPDATE_STATE 校验 expected_owner_ref；不能用 A 的选项更改 B。
- 参数和状态合法性仍交由同一领域校验器及真实文本生成验证；Profile 缺失或语义失败零写入。未接命令仍为 COMMAND_NOT_IMPLEMENTED。

新增核心 Symbol 映射：CAP-FEAT-OPERATION-001→symbol.feature.operation，CAP-STATE-001→symbol.state.basic，CAP-FEAT-STATE-001→symbol.feature.state。验证实际 Catalog 存在，Grammar/Rule 引用 exact 整资产；不捏造节点专用句式。

## 4. 共享领域函数与无损写回

从旧 Service 提取创建 Feature、创建 State、更新 State、修改 State presentation 四个纯函数；v1 保留旧入口授权与 Revision 提交，v2 不生成旧 query/option，也不调用 v1 edit。v2 计算结果保持内部 seed identity，再经过完整校验和生成。恢复 Feature State 的 occurrence 必须使用 FEATURE_STATE_NODE；共享原逻辑硬编码 STATE_NODE 的错误同步修正，Object State 不变。

`DraftOwnedConstructEdits` 按 ID 和明确字段写回原始 JSON：创建只追加新增实体/occurrence/layout 和 owner/context 的对应 ID 列表；State 修改只写 name.local_name/state_roles，不重置 namespace/source/normalization/owner。State presentation 只增改该 context/state 记录，隐藏只移除对应 State occurrence/layout，保留语义 State 和 Fact；显示时分配新 occurrence/layout（由领域函数生成），不复用已删除身份。新布局使用请求值或既有默认位置，不声称恢复已删除布局。

FOLD/UNFOLD 不删除 State 或关系；SUPPRESS 不删除语义 State、Fact。已处于目标状态的操作、同名/同角色集合提交返回 UNCHANGED，角色集合等价时保留原顺序；缺省 EXPLICIT/UNFOLDED 不因补一条等价 presentation 而增加 Journal。已有记录和无关字段的 optional 存在性、顺序、负零、route_points 保留。State 重新显示的实际 OPL/Trace 必须生成成功才提交。

应用服务负责授权重算、输入与 owner 绑定；正文写回 owner 不接收浏览器整份模型。事务/幂等/冲突/deadline 继续沿用 HS-02A，禁止额外 Revision/content/checkpoint 写入。

## 5. Plan 与验收

先同步 v2 字段约束 → 提取纯领域函数 → 候选/参数授权和无损写回 → 真实 HTTP/SQLite 回归。

- HS-O01：Object/Process 上创建 Attribute/Operation，Object/Feature State 创建、修改名称/角色；owner/context/资产 refs 闭合。
- HS-O02：四种 presentation、重复操作、隐藏 State 再显示、Feature State 角色、刷新重开；语义 State/Fact 保留且真实 OPL/Trace 一致。
- HS-O03：伪造选项、跨目标/owner/Context、错误 Capability/version/role/ownership、Process State、过期 token、空白/超长/ordinal 全部拒绝且零部分写入。
- HS-O04：保留 namespace、描述、essence、源信息、未编辑几何；UNCHANGED/重试不增 Journal；Revision/content/checkpoint 不随编辑增长。
- HS-O05：v1、HS-02B/Journal/摘要及生成器回归通过；失败场景不改变用户数据。不把 MockMvc 称为浏览器证据。

回滚仅撤回本包改动，保留前序差异；不执行数据库降级或清理。
