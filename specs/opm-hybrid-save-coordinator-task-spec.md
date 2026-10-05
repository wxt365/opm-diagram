# HS-02F 保存事务与协调器核心

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。

状态：设计冻结，核心已实现并通过定向验证（2026-09-14）；未装配公共保存入口或宿主自动注册。上位：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)。

## 1. 范围与执行顺序

先解决内容去重与精确检查点的冲突，再实现 SQLite 保存事务、手动优先队列、10 秒 Runtime 调度核心与失败退避。本包不装配公共 Save/Pin HTTP、用户库迁移和前端，不伪造已能打开新历史 ID 的 v1 history reader。协调器由后继 Runtime 接入显式注册活动模型并启动；本轮仅对临时 SQLite 运行。Pin、统一历史物化、启动模型发现、双检查点降级和压缩留后继。

允许本规格、总实施规格、总设计、实施 Checklist；新增 docs/contracts/migrations/sqlite-checkpoint/V4__checkpoint_capture_overlay.sql；主 Java storage/{DraftJournalRepository,DraftSaveRepository}.java、application/DraftSaveCoordinator.java；测试 storage/DraftSaveRepositoryTest.java、application/DraftSaveCoordinatorTest.java。Java 根 services/local-runtime/src/{main,test}/java/org/opm/localruntime/。不改 V1/V2/V3 SQL、默认迁移资源、公共 wire、依赖、Profile、用户库、前端、发布证据或 .harness。直接当前目录开发，保留前序差异，不提交。

保存请求摘要复用 api/DraftCapabilityIdentity.java 的包内数字编码；将该文件纳入允许修改范围，仅增加 save 入口，不改变既有 query/option/impact/finding 公式。

## 2. 检查点差量层

draft_content 按 SaveContentDigest/1 去重，但同摘要可有不同派生/历史元数据甚至无损原始数字形状；不能直接以最早 artifact_json 代替新捕获状态。新增不可变 draft_checkpoint_overlay：checkpoint_id 主键并外键引用 checkpoint，content_delta_json、artifact_delta_json 使用既有 OPM-DRAFT-JSON-DELTA/1，document_digest 使用 DraftJsonDigest/1 对完整捕获文档计算。差量基于该 checkpoint 引用的 draft_content 两部分，应用后才可继续重放 Journal。

表在 V4 新建，UPDATE/REPLACE 禁止；本轮无清理操作。仅历史初始化 covered_seq=0 checkpoint 允许无 overlay；任何非零 checkpoint 缺 overlay 或差量/摘要错误返回 DRAFT_RECOVERY_REQUIRED。V3 旧草稿仍可编辑/查询；保存明确要求 V4，不偷偷建表。正向迁移仅测试显式执行，默认资源不注册；V4 存在且产生检查点后禁止用旧程序写入，不执行降级。保留迁移前副本为止损路径。

V4 必须放在旧 sqlite/ 扫描根之外的 sqlite-checkpoint/，保存迁移显式同时注册两个 filesystem locations 并 target=4。既有 HS-01C 仍只发现 exact V1/V2/V3，不修改其三文件 allowlist 或放宽校验；V4 不得混入旧离线 PREPARED 输出。

保存和当前/指定 token 恢复共享 Journal 的事务、scope、差量和摘要校验。指定 token 在同一事务从 covered_seq<=target 的最近检查点重放至 target；不能静默换成 head。当前读取仍验证全部尾部 Journal，不忽略超出 head 的损坏记录。捕获内容使用同一 BEGIN IMMEDIATE 写事务保护，尚无压缩时不需要跨事务 retention；后继缩短事务或启用压缩必须追加持久化 READ 引用。

## 3. 保存事务

DraftSaveRepository.manual(project,model,SaveRequest,validate) 返回既有 SaveResult；checkpoint(project,model,validate) 为内部 AUTO，捕获事务内 head，返回 checkpoint_id/captured_token。validate 必须由可信应用提供，不接受客户端文档；生产接入必须在 exact Profile 下完成核心和 OPL/Trace 证据校验。本包测试区分存储 mock 与真实领域验证，不把内部 callback 当公共保存 API。

顺序：scope/mode/V4 → SAVE receipt 去重 → 验证当前完整草稿与 captured token → 重建 captured 文档 → validate → 校验/复用 content blob → 同 captured_seq 精确检查点复用或原子写 checkpoint+overlay → MANUAL 历史映射 → stream 覆盖状态 → receipt → 重读一致性 → commit。任一步失败回滚；旧 Journal、checkpoint、head 不被清理，失败不写成功收据。

DraftSaveRequest/1 的 preimage 精确为 {identity_version:"DraftSaveRequest/1",project_id,model_id,save_id,target_draft_token,reason}，全部数字按既有 binary64 编码→JCS→SHA256；不接受外部 AUTO。相同 save_id/请求返回原 SaveResult，不重跑 validate；不同请求返回 IDEMPOTENCY_MISMATCH。非法 draft 或未来序号为 DRAFT_CONFLICT，绑定不符优先 RULE_VERSION_CONFLICT。恢复缺失或损坏为 DRAFT_RECOVERY_REQUIRED，SQLite 错误为 PERSISTENCE_FAILED。

收据重试必须验证 checkpoint/保存点仍属于本模型，checkpoint 的 draft/seq 等于 captured_token，checkpoint 与保存点 content_digest 相同，保存时 head_token 位于 captured_token 与当前 head 之间且绑定一致；并复核该捕获状态可重建。篡改收据引用不能作为成功保存返回。固定 Node parity 输入 project.test/model.test/save.test、token=draft.test/7/64个a、reason=MANUAL，预期 SHA 为 b854de91795e6f523c99c7d04ffe3d6a67d7526fa2ec01b7e13359ba960ba653。

MANUAL 比较最近 purpose=MANUAL 的 content_digest：相同返回该 revision_id/UNCHANGED；不同新建 revision.* 和递增 history_sequence，purpose=MANUAL。初次保存即使 seq=0 也产生首个手动事件；AUTO 后手动仍建事件，复用内容和检查点；A→B保存→A 建新事件但复用 A blob。只写 draft_savepoint，不写 legacy revision_document/model_head；新历史 ID 的对外读取待统一 history reader，不能在本包公开永久链接。

checkpoint 指针只前进，不因保存旧 target 回退。若 captured_seq>=当前覆盖，则覆盖推进到 captured；其后仍有编辑，dirty_since 取最小未覆盖 edit_seq 的 occurred_at，deadline=其后10秒，否则均 null。内容相同但 edit_seq 增加也建立新的覆盖检查点和 overlay，零新增 content blob/历史事件。保存不增加 edit_seq、不使当前候选失效。本轮保留全部 checkpoint/Journal，不宣称容量闭环。

## 4. 协调器和时钟

每个 DraftSaveCoordinator 实例绑定一个明确 project/model/backend，不扫描目录。requestManual(SaveRequest) 入队并返回 CompletableFuture；相同在途 save_id/同请求共享 future，不同请求立即拒绝。poll() 每次最多执行一个事务，使用运行锁防止同实例并发保存；MANUAL FIFO 先于 AUTO。不同 captured token 不能合并成最高 token 冒充每个请求均保存了同一内容；pending_manual_target 仅为队列最高目标的状态摘要。相同内容由数据库去重，事务已执行的 AUTO 不抢占，排队 MANUAL 在其后先执行。该条细化上位“合并最高目标”的排队描述，不改变 exact 捕获语义。

start(ScheduledExecutorService) 使用固定100ms周期调用 poll，首发失败隔离在当前模型；不自行创建/关闭外部 executor。close 取消调度、拒绝排队请求，已进入事务不回滚。后继宿主负责注册模型、生命周期和进程重启发现。

排队请求在事务执行时最终验证，pending_manual_target 只统计与当前 head 同 draft/binding 且不超出 head 的目标；不可把尚未通过范围校验的未来/异草稿 token 写入合法 SaveState。future 保留原异常；状态中的非 SaveError 枚举内部失败统一标记 DRAFT_RECOVERY_REQUIRED，未知运行异常为 PERSISTENCE_FAILED，不映射为保存成功。

Clock 提供持久化 UTC，LongSupplier 提供单调纳秒。首次发现 dirty 时，按 max(0,deadline-wallNow) 建单调期限；墙钟早于 dirty_since（重启倒退）立即调度；同一 dirty_since 不因后续编辑或墙钟变化重置期限。dirty_since 改变时重新计算。AUTO 失败按1/2/4/8/10秒单调退避，后续10秒；手动请求不受退避阻挡。成功清除错误并根据新 snapshot 重置期限。状态返回既有 SaveState，真实 in_flight/pending/last_error；相同实例排队与状态受同步保护，不替代 SQLite 多实例串行化。

退避仅适用于 PERSISTENCE_FAILED；AUTO 的非可重试错误（恢复/绑定/模式等）暂停自动执行，直到显式手动保存成功或宿主完成恢复并重新注册。无效 MANUAL 请求的范围/幂等错误不得阻止正常 AUTO；MANUAL 的存储失败共享退避。成功操作清除暂停状态，不把恢复阻断标成 retryable=true。

## 5. 验收、验证与回滚

- HS-S01：V3→V4、重复 Flyway migrate、FK/不可变守卫，旧 V3 保存拒绝且原库不变。
- HS-S02：AUTO 不增历史；MANUAL 首次/无变化/AUTO后/撤销/ABA，内容去重、捕获覆盖、幂等和错 token。
- HS-S03：同内容不同元数据/负零和可选字段的 overlay，后续编辑重放；旧捕获保存不丢较新编辑，损坏拒绝。
- HS-S04：CONTENT/CHECKPOINT/HISTORY/STREAM/RECEIPT/VERIFIED 各阶段异常与真实 SQL 失败全回滚，两个实例并发去重。
- HS-S05：可控时钟持续编辑10秒期限、30秒三次调度、手动优先/在途 AUTO/重复请求/退避/墙钟倒退/close；真实 executor 启动和停止。
- HS-S06：相关存储、草稿 HTTP、摘要、生成/类型回归；实际命令/文件记录到 Checklist。

Plan：先 V4+共享回读 → 保存事务 → 协调器 → 目标测试 → 相关回归。回滚撤回本包代码；已产生保存数据的 V4 库保留并停写，不 DROP 表、不用旧程序继续写；迁移测试只操作临时库，无用户库回滚。
