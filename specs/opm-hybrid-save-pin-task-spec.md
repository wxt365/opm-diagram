# HS-02I 固定草稿版本 Pin

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。Pin 保留引用依赖迁移修复，事务与迁移验证不可拆开交付。

状态：设计冻结，已实现并通过定向和相关回归（2026-09-14）。上位：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)；证据：[实施 Checklist](../docs/checklists/opm-hybrid-save-implementation-checklist.md)。

## 1. 目标与边界

装配已有 PinRequest/PinResult 和 /api/v2/projects/{project}/models/{model}/draft/pin，将精确草稿捕获固定为真实可读的不可变历史并登记保留引用。不创建 Snapshot/Baseline/Export 业务记录，不声称完成这些消费者接入；purpose 仅表示固定用途，BASELINE 仍需其独立全量校验流程。既有历史列表暂以 kind=DRAFT 展示固定点，不能标为 BASELINE。

允许本规格、总实施规格、总设计、实施 Checklist、HS-02G 后继状态说明；scripts/generate-draft-save-contract.mjs 与其三份生成输出、scripts/draft-save-contract.test.mjs；主 Java api/{DraftCapabilityIdentity,DraftSaveController}.java、application/{DraftSaveCoordinator,DraftSaveService}.java、storage/DraftSaveRepository.java；测试 api/{DraftSaveControllerTest,DraftCapabilityIdentityTest}.java、application/DraftSaveCoordinatorTest.java、新 storage/DraftPinRepositoryTest.java。Java 根为 services/local-runtime/src/{main,test}/java/org/opm/localruntime/。

联调补充允许：独立 docs/contracts/migrations/sqlite-pin/V5__pin_retention_nullable_sequence.sql；测试 storage/DraftWorkspaceTestDatabase.java 仅扩展 count 的受控表白名单为 draft_retention/draft_checkpoint_overlay。不改默认迁移注册、V1~V4 原文、API Schema 字段、依赖、Profile/Golden bytes、用户数据库、前端、发布证据和 .harness。不使用 worktree 或提交；保留当前目录已有差异。当前用户库模式不变。

## 2. 唯一事务与身份

沿现有严格解码、安全三项和 SaveError 映射，未知/缺失/重复字段、AUTO 用途、非整数 token 词法返回 INPUT_INVALID/400。Pin 只接受已激活 V2、已显式迁移 V4+V5 的模型；缺 V5 返回 DRAFT_RECOVERY_REQUIRED/503，MANUAL/AUTO 继续兼容 V4，不在请求中迁移。

V3 的 min_edit_seq 可空字段含 typeof(value)='integer' CHECK，实际拒绝 null。V5 仅事务重建 draft_retention，固定具名约束 draft_retention_nullable_seq_v5：min_edit_seq IS NULL OR (typeof(min_edit_seq)='integer' AND min_edit_seq BETWEEN 0 AND 9007199254740991)。其余字段、PK/FK/CHECK 和既有行逐项不变；表无入向外键/既有触发器。创建临时命名表→复制全部引用→删除旧表→rename，Flyway 同一 SQLite 事务完成，失败回滚原表/行；不可在事务外运行。Pin 在写前核对 sqlite_master 中该具名约束，拒绝旧约束，不靠捕获 SQL 错误猜版本。测试正向/重复执行、原行等价、FK/负数/浮点/null 非法形状与中途失败。生产启用仍由后继备份/迁移流程负责，停止条件为任何迁移/等价校验失败；不承诺大库锁定耗时，不反向删除已发放固定点。

请求摘要固定 SHA-256(JCS(DraftEditRequestIdentity.encode(preimage)))，preimage={identity_version:"DraftPinRequest/1",project_id,model_id,pin_id,target_draft_token,purpose}。只包含这六字段；Node/Java 固定向量对照。幂等主键为 model/PIN/pin_id，与 SAVE/EDIT 隔离。

SQLite BEGIN IMMEDIATE：scope/V4/V5 → 先查耐久收据 → 验证 token 和捕获内容 → 真实 active binding/核心/全部 Context OPL/Trace 校验 → 复用内容/精确检查点 → 固定历史 → 保留引用 → 只向前更新检查点覆盖 → 收据 → 回读完整性 → commit。同一 purpose/draft_id/captured_seq/content_digest 固定点复用，不按名称、旧 HEAD 或其他用途选取；不同捕获序号独立事件，正文仍按内容 digest 去重。MANUAL 保存点不参与 Pin 去重，Pin 不改变 last_manual_revision，不使下一次 MANUAL 错判已保存。全局历史序号沿 HS-02G 的安全上界。

每个成功 pin_id 登记一条 draft_retention：retention_id="retention.pin."+request_digest，kind=purpose，draft_id=捕获 draft，revision_id=固定点，checkpoint_id/min_edit_seq 均 null。保留引用只指向不可变版本及其 content，不永久钉住可回收 Journal。首发禁止自动释放该引用，不增加删除入口。

固定摘要向量：project.test、model.test、pin.test、purpose=PERMALINK，token={draft_id:"draft.test",edit_seq:7,binding_digest:"a"重复64次} → 0526b1948d39fff497ff228e04978536459c48e8d458d2f15096d17ffb2d41ff。edit_seq 经既有 encode 变为 binary64 对象，不将该摘要误写成直接整数 JCS。

同 ID 同请求直接返回原 PinResult，不重新领域校验或生成 ID；仍严格核对 result.pin_id/captured_token、固定点 draft/seq/purpose、保留引用完整形状和 DraftHistoryRepository 的 raw/content digest、历史绑定摘要。此重试不依赖旧 Journal/checkpoint，不受后续 Profile 文件丢失影响；新请求仍需可重建 token 和真实校验。同 ID 异请求返回 IDEMPOTENCY_MISMATCH/409；损坏收据/固定点/保留引用/blob 返回 DRAFT_RECOVERY_REQUIRED/503，不修补成功证据。

失败整笔回滚，零半个固定点/保留引用/收据；新编辑不被旧 token 覆盖，checkpoint 指针不回退。READ 保留由当前 SQLite 写事务锁住读取与写入窗口；尚无压缩并发路径，本轮不生成可独立于事务泄漏的临时引用。

## 3. 调度与 HTTP

Pin 进入同模型协调器，与 MANUAL 共用按入队顺序的显式请求队列；二者均优先于未启动 AUTO，不中断在途事务。队列键包含 operation 和 id；相同排队请求共享 future，异体拒绝。in_flight=PIN；pending_manual_target 只统计 MANUAL，不混入 Pin。成功清除旧保存错误，失败沿既有映射/退避，关闭取消尚未开始的 Pin，等在途完成。Controller 只解码/转交；HTTP 等精确 future，断连不取消已接受事务。

收据查询沿已有 POST /draft/receipts、operation=PIN；EXACT workspace/projection/text 沿 HS-02G/02H 读取。PinResult 不增加字段，OpenAPI 只更新实现状态，生成 Java/TS bytes 应保持不变。不会由服务返回或复制 HEAD URL 充当固定链接。

## 4. 验收与 Plan

- HS-P01：四用途、首次固定、同 token 去重、不同 token、MANUAL 隔离、旧 token/更晚编辑、真实不可变历史重开。
- HS-P02：operation/id 幂等、并发双实例单提交、回放不依赖历史 Journal/检查点、缺引用/坏 blob/坏收据拒绝、各阶段/SQL 故障全回滚及重试。
- HS-P03：MANUAL/PIN FIFO 与 AUTO 优先级、在途 PIN、状态和关闭；PIN 不污染 pending_manual_target/last_manual_revision。
- HS-P04：真实 HTTP+SQLite/OPL、严格 wire/安全、错误模型/模式/V4/token/绑定/资产；Node/Java 摘要、相关回归、生成/类型/diff/文档检查。

Plan：补齐唯一规则 → 复用保存事务和历史 reader → 扩展显式队列 → 接 HTTP → 定向持久化/调度/HTTP → 相关回归并记录。测试只用临时 SQLite；不声称浏览器、模式迁移、强停或容量完成。

回滚仅撤回本包接入，保留已生成固定点和引用；不得删除已发放永久版本或降级用户模式。
