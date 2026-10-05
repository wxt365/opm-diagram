# HS-02H 多 Context 文本与保存

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，已实现并通过定向及相关回归（2026-09-14）。上位：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)；实际证据：[实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。

## 1. 范围

解除 HS-02G 对已物化非根 OPD 的 blanket 阻断，使已有 OWNED occurrence 的多个 Context 可以分别生成 OPL/Trace 并作为一个模型保存。只根据持久化 Context 成员读取，不推导细化树，不合并子图句子到父图，不新增子图创建/引用编辑功能。

允许本规格、总实施规格、总设计、实施 Checklist、HS-02G 规格的后继状态说明、符号文本实现契约；主 Java text/OplTextGenerationService.java、application/DraftSaveService.java；测试 text/{OplTextGenerationServiceTest,OplMultiContextTest}.java、api/DraftSaveControllerTest.java。Java 根为 services/local-runtime/src/{main,test}/java/org/opm/localruntime/。

禁止改 API/Schema/SQL/默认迁移/依赖/Profile/Golden bytes/发布证据/前端/.harness/用户库。只在当前目录开发，不建 worktree、不提交。已运行用户模型仍 V1。四种 Context 的文本支持不代表完整 Context CRUD、ViewDefinition 或 RefinementEdge 执行已交付。

## 2. 唯一文本范围与身份

支持存在的 SYSTEM_DIAGRAM、PROCESS_REFINEMENT、OBJECT_REFINEMENT、MODEL_VIEW。PROFILE_CONTEXT 缺 Profile 专用文本契约，继续 TEXT_PLAN_UNSUPPORTED；不存在 Context 同码。Context occurrence_ids 必须无重复、全部存在、context_id 等于当前 Context，且不得遗漏任何声明属于该 Context 的 occurrence；错误 TEXT_TRACE_INCOMPLETE，不静默过滤悬空/跨图引用。

Legacy consumption 与 ISO Procedural/Structural 使用同一 Context 范围构造。仅规划当前 Context 中有 FACT occurrence 的 Fact，按 Fact 身份去重，多 occurrence 不重复句子。未在该 Context 出现的 Fact 不进入候选生成；全模型保存另检查每个 Fact 至少有一个 OWNED occurrence，防止无主 Fact 被所有视图共同漏掉。

当前 ACTIVE 文本合同仍要求 Fact/端点 owner 使用当前 Context 的 OWNED occurrence。REFERENCED/VIEW_DERIVED 不可替代必要 owner；被显示但仅有非 OWNED occurrence 的 Fact 仍拒绝生成。可选 State/Feature occurrence 继续原规则；本轮不修改任何关系句式/endpoint/source catalog/Control/fan/排序或 grammar binding。

rootContextId 对应句子、Token、Trace、Artifact 的现有公式完全不变，保留 exact golden 兼容。非根句子 ID = identifier("sentence", context_id, existing_sentence_id)，existing_sentence_id 使用原句式公式；Token/Trace 从该句子 ID 按原公式派生。Artifact/Paragraph 已包含 revision/context，保持原公式。两个子图共享 Fact 时文本可相同，但句子/Token/Trace/Artifact 身份不能碰撞；所有 occurrence source 都必须来自请求 Context。

空 Context 正常生成一个空 Paragraph、零句子和零 Trace；保留有效 Artifact/digest。保存继续对所有 Context 执行真实 Profile/核心/OPL/Trace 校验，任一子图失败整笔回滚 SAVE_VALIDATION_BLOCKED/422。不写新的 Artifact 表或覆盖 blob，不改变 Journal/capture/历史摘要。查询所有图再保存/重开，必须保持同一模型内容和精确历史身份。

## 3. 验收

重复 occurrence_ids 在现有 SemanticRevision 构造器即被拒绝，原始输入走 SemanticReadException；若已进入文本语义视图的闭包检查失败则 TEXT_TRACE_INCOMPLETE。保存入口统一映射 SAVE_VALIDATION_BLOCKED，不为实现重复字段反例放宽语义 reader。

既有反例适配只修 fixture：非法端点/Self-invocation 测试替换 Fact 时保留其已有 ID，使当前图真实指向受测 Fact；Legacy Structural 测试移除已从 Context 清单剔除的旧 occurrence。保留全部错误码/文本断言，不以恢复全模型遍历绕过按图筛选。

测试复用点：将测试 storage/DraftWorkspaceTestDatabase.java 纳入允许范围，只增加 addOwnedContext；从测试文档的根 Context 显式复制 occurrence 到独立 Context，保留共享语义目标，为每个复制 occurrence/layout 分配以传入 Context ID 为前缀的测试身份。该 helper 仅构造临时夹具，不成为生产 Context 创建接口，不修改源 fixture bytes。

- HS-C01：四种 Context（含空图）可生成；未知/Profile Context、悬空/跨图/重复成员及缺少必要 OWNED 端点拒绝。
- HS-C02：Legacy 和 ISO 分支按图过滤；共享 Fact、不同子图关系和无关关系隔离；根 golden 不变，子图身份不碰撞，Trace/token 的 occurrence source 不越图。
- HS-C03：至少两个非空 OPD + 空图真实 SQLite/HTTP 保存、子图查询、根对象改名后重存和旧历史重开；全模型一次保存一个保存点/零逐编辑 Revision；孤立 Fact、损坏子图零部分保存。
- HS-C04：定向文本/HTTP测试，再 OPL golden、保存与旧 Runtime 回归；Node 契约、Web 类型、diff/文档检查。未运行浏览器、用户迁移、OS 强停或容量测试。

Plan：冻结范围 → 共用 Context 守卫和局部 Fact 集合 → 非根身份 → 全模型保存覆盖守卫 → 真实文本和 HTTP 回归 → 更新证据。

回滚撤回本包代码；已保存的多图数据保留，旧程序遇到非根图会阻断，不删除/改写保存点，不降级模式。
