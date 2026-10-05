# HS-02G 保存 HTTP、宿主与统一历史读取

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，已实现并通过定向及相关回归（2026-09-14）。上位：[实施任务](opm-hybrid-save-strategy-implementation-task-spec.md)。直接当前目录开发，保留既有差异，不提交、不使用 worktree。

后继状态：本包所述 Pin 待实现边界由 [HS-02I](opm-hybrid-save-pin-task-spec.md) 接入；本文保留 HS-02G 交付时的范围和证据，不表示 Pin 当前仍无后继实现。

## 1. 目标与范围

让 HS-02F 的手动保存结果可经既有 EXACT 工作台/投影/文本和历史列表读取，再接通 Save/SaveState 与按需注册的 Runtime scheduler。不得返回无法解析的保存点，或从当前草稿猜测历史内容。

允许本规格、总设计、总实施规格、实施 Checklist；Save Schema 与生成器及其三份生成物；workspace generator 的五份输出（仅同步引用 SaveError）；主 Java storage/{DraftSaveRepository,DraftHistoryRepository}.java、semantic/DraftSemanticView.java、application/{DraftSaveService,DraftSaveCoordinator,DraftWorkspaceService,LocalApiService}.java、api/{DraftSaveController,DraftSaveExceptionHandler,LocalWriteRequestGuard,DraftWriteRequestGuard}.java；测试 api/DraftSaveControllerTest.java、application/DraftSaveServiceTest.java、storage/DraftHistoryRepositoryTest.java，已有 storage/DraftSaveRepositoryTest.java 仅补序号上界测试。Java 根为 services/local-runtime/src/{main,test}/java/org/opm/localruntime/。

禁止改 SQL、默认迁移注册、依赖、Profile bytes、用户库、前端交互、发布证据和 .harness。V1/V2/V3/V4 原文不变；仅临时 SQLite 显式启用现有 V4。Pin、Baseline/Export 对新保存点的写接入、启动目录发现、在线迁移、前端、压缩/双检查点降级和强停证明不在本包。

## 2. 历史物化与身份

新保存点继续引用不可变 draft_content；读取不依赖当前 head、Journal 或可回收 checkpoint。先按 project/model 校验范围；精确查 legacy Revision 和 draft_savepoint，二者身份冲突拒绝。legacy 保持旧读取行为；新保存点的 blob 缺失、artifact raw SHA、SaveContentDigest/1、model 身份错误均拒绝，禁止 fallback 到旧 HEAD 或当前草稿。

对外 sequence = 同模型 legacy MAX(revision_sequence) + history_sequence；V2 模式的既有 trigger 禁止继续插入 legacy Revision，因此偏移固定。写入前检查合计不超过 Integer.MAX_VALUE（现有 SemanticRevision 的上界），超限 DRAFT_CONFLICT，整笔回滚。读取越界或非正序号为 DRAFT_RECOVERY_REQUIRED。历史父链逻辑为前一个 history_sequence 保存点，首个指向对应 draft 的 base Revision；本包不新增公开 parent 字段或写旧 revision_parent。

DraftHistoryRepository 返回封闭内部记录（保存点 ID、全局序号、purpose、created_at、content document）；document 是受校验 blob 的原始容器，不能冒充新 Revision 的完整交换文档。应用的 DraftSemanticView 只建立查询语义视图：保留完整语义/布局集合，整数按既有精确整型规则转换；用保存点 ID 和全局序号替换视图身份。原 blob、metadata 和内容 digest 不改写。既有 text 查询按该新身份、exact Profile 重新生成 OPL/Trace，不复用旧 metadata 的 artifact ID；布局/对象/关系 ID 不变。不同 Context 按明确 context 生成，保存验证遍历全部 Context。

历史列表按全局序号降序合并，MANUAL 在既有 v1 kind 枚举暂表示 DRAFT，immutable=true；AUTO 无列表项。EXACT 始终只读，后续编辑不能改变其内容；工作台 HEAD 在用户模式接入前仍是旧入口，本包不冒充最新 V2 草稿。旧验证/基线/导出写流程不因此获得新保存点写权限。

v1 查询遇到新保存点损坏返回既有 PERSISTENCE_FAILED/503、retryable=false，不新增 v1 错误码；不存在返回 NOT_FOUND/404。查询只装配语义视图，不写任何旧索引；保存校验保证核心零 blocking，历史 findings 继续既有只读索引行为，其完整诊断能力留后继。

## 3. 保存验证、宿主与 HTTP

DraftSaveService 是 Spring 单例，按精确 project/model 懒注册一个 coordinator，共享受宿主管理的 daemon scheduled executor；只读已存在、显式 V2/V4 的库。成功 OpenDraft 或直接 Save/SaveState 注册该模型，关闭宿主停止新注册/排队和 timer，等待在途事务自然完成；不在 GET 中创建模型或执行迁移。启动后未打开的模型自动发现不在本包，已耐久 Journal 可在再次打开后继续 checkpoint。

保存 callback 必须验证 active binding 完全相等、SemanticRevisionValidator 核心规则及 exact Profile 下所有 Context 的 OPL/Trace write evidence。无法生成文本或资产缺失返回 SAVE_VALIDATION_BLOCKED，不把不可重试资产错误当磁盘重试。内部读取/校验不改变捕获 raw JSON。同 save_id 收据重试继续 HS-02F 幂等，不能因后续资产变化改写原收据。

POST /api/v2/projects/{project}/models/{model}/draft/save 严格读既有 SaveRequest，拒绝 unknown/duplicate/coercion/trailing/显式 AUTO；返回 SaveResult。GET 同根 /save-state 返回 SaveState。两者都校验 Host、Origin、X-OPM-Session；保持 v1 GET 不变。Controller 仅解码/调用，错误由独立 advice 返回 SaveError（三字段，不附 reason_code）。新增封闭码 LOCAL_SESSION_INVALID/403、DRAFT_MODE_REQUIRED/409、SAVE_VALIDATION_BLOCKED/422；其他映射沿用。JSON 解码400；缺V4/损坏503 DRAFT_RECOVERY_REQUIRED；只有 PERSISTENCE_FAILED 可重试。Pin 不注册 handler，OpenAPI 标注其仍待实现。

OpenDraft 注入同一宿主的真实 SaveState；若状态和文档捕获 token 不同则 DRAFT_CONFLICT，不拼接跨时点结果。测试旧显式 clock 构造可不注入宿主，以保留纯草稿测试的时间隔离；生产 Spring 构造必须注入。状态 in_flight/pending/last_error 来自同一 coordinator。手动请求入队后由同一 poll 驱动；HTTP 同步等待该精确请求完成，断连不取消已接受保存，可用 save_id 重试。

## 4. 验收与回滚

联调修正：草稿响应 reader 保留 binary64 后会将 edit_seq 输出成 1.0，而 SaveRequest 严格整数解码拒绝浮点词法。将 api/DraftWorkspaceController.java 纳入本包，响应出口仅规范化已通过 Schema 的 DraftToken 槽位：draft_token/base_token/result_token/durable_token/checkpoint_token/pending_manual_target/captured_token/head_token/target_draft_token 的 edit_seq 写为整数 JSON。不得改请求摘要、原始 Journal、布局浮点或 modifier；不放宽 SaveRequest 解码。测试直接复用 HTTP 返回 token，禁止在测试中替消费者补转换。

V3 兼容澄清：宿主允许读取/注册既有 V2/V3 草稿，OpenDraft 保持可用；缺少 V4 时真正保存才拒绝 DRAFT_RECOVERY_REQUIRED，AUTO 保留错误并暂停。不通过注册自动迁移。

Context 边界（HS-02G 交付时的历史范围）：当时 OPL owner 的 plan/generateProcedural 只支持 root SYSTEM_DIAGRAM，含非根 Context（包括空视图）保存返回 SAVE_VALIDATION_BLOCKED/422、零保存。此 root-only 限制由 [HS-02H](opm-hybrid-save-context-text-task-spec.md) 替代，支持其定义的四种已物化 Context 和 OWNED 文本范围；保存仍逐 Context 验证，不能跳过失败子图。PROFILE_CONTEXT、必要 owner 缺失等限制仍须在用户模型启用迁移前检测。

- HS-H01：手动保存→EXACT workspace/projection/text→后续真实编辑→旧版本重读，ID/序号/语义/OPL一致；旧 legacy 和列表合并保持可用；零逐编辑 Revision。
- HS-H02：内容去重、AUTO 不入历史、旧 token 保存、重复 save_id、同内容 UNCHANGED；删除可回收 checkpoint/Journal 后历史内容仍独立可读，损坏或错模型拒绝。
- HS-H03：严格 wire、安全三项、错误模式/缺V4/缺资产/错误绑定/未来 token、失败零保存部分写；SaveState 和 OpenDraft 使用真实宿主状态。
- HS-H04：按需注册、真实 executor 自动保存、重建宿主后按需恢复、关闭和重复注册；核心协调器原有可控10秒回归。
- HS-H05：Java 定向→相关回归、Node 契约生成和 Web 类型、diff/文件检查。测试只使用临时 SQLite；不声称浏览器、用户迁移、强停或容量通过。

Plan：先独立历史 reader/精确语义视图与序号守卫；再宿主和可信 validator；同步 wire/HTTP/security/OpenDraft；真实 SQLite/MockMvc 和生命周期回归；更新实际证据。

回滚撤回本包新增接入；已有 V4 保存数据保留、停写，不 DROP，不覆盖用户库、不降级模式。
