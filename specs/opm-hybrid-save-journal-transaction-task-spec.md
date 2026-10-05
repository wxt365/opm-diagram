# HS-02A 草稿增量事务与耐久收据

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。

状态：设计冻结，存储事务与单 checkpoint 后增量重放已实现并通过定向验证。上位规格：[混合保存实施](opm-hybrid-save-strategy-implementation-task-spec.md)。当前目录开发，保留已有差异，不创建 worktree。

## 1. 目标和范围

实现真实 SQLite 的草稿存储事务、幂等编辑收据、无损可逆增量与 checkpoint 后连续重放。没有每编辑完整 Revision/内容 blob 写入。默认 V3 继续不打包，不激活用户库，不装配 HTTP 或前端。

允许新增 `services/local-runtime/src/main/java/org/opm/localruntime/storage/{DraftJsonDelta,DraftJournalRepository}.java`、对应测试两文件、`docs/contracts/schemas/opm-draft-journal-v1.schema.json`、`scripts/draft-journal-contract.test.mjs` 及本规格；允许同步保存设计、总实施规格和实施 Checklist。不修改现有 SQL、Profile、依赖、旧 Service、用户数据、发布文件或 `.harness`。

## 2. 增量唯一契约

`draft_journal.delta_json` 与 `artifact_delta_json` 分别保存 split.content 和 split.metadata 的 `OPM-DRAFT-JSON-DELTA/1`：schema_id/schema_version/before_digest/after_digest/operations。operations 保序，条目为 path/before/after；path 是非空字符串数组，每项为对象键或无前导零的数组下标。slot={present:false} 或 {present:true,value:JSON}；null 与缺失严格不同。封闭字段见机器 Schema。仅 value 内允许通用 JSON 子树，最终完整文档还须通过 SaveContentDigest/1 的封闭 Schema，不能借 delta 放宽业务载荷。

增量生成：对象键按 UTF-16 顺序取并集递归；数组先递归共同长度，再按下标降序移除尾项或升序追加尾项；标量/类型变化保存替换槽。禁止整份对象/数组无差别替换，新增/删除子树按实际变化保留。重放先检验 before_digest，在独立副本逐项核对 before 槽，再改动，最后检验 after_digest；失败不改变输入。逆向增量交换两个摘要和每个槽，并反转操作顺序。

DraftJsonDigest/1 为 SHA-256(JCS({digest_version:"DraftJsonDigest/1",value:E(value)}))。E(number)=["binary64",大端小写16位hex]；E(array)=["array",逐项E后的数组]；E(object)=["object",键名不变而值逐项E的对象]；其余 JSON scalar 保持。全容器加类型标签，防止数字编码与真实 JSON 对象/数组碰撞；保留 -0、数组顺序与 optional 存在性。严格 raw parser 拒绝重复键、尾随、非有限数和非法 Unicode。此摘要只验证可逆 JSON delta，最终模型摘要仍为 SaveContentDigest/1；不修改任何既有 JCS/binary64 owner。

## 3. Repository 边界及事务

`DraftJournalRepository(Path database, Clock clock)` 只接受已有数据库；`commit(projectId,modelId,DraftWorkspaceContract.Document request, Edit effect)` 返回经过 HS-01D 校验的 DraftEditResult。Edit 是可信应用层内部函数：接收当前完整文档的独立副本，返回 Proposal(documentJson,affectedIds,textTraceIds,validationSummaryJson)。只在模式/token 守卫成功后调用一次，重试重放不调用。validationSummaryJson 必须符合 HS-01D ValidationSummary，来自本次真实校验；原始 Revision 的 validation_summary 可缺失且结构不同，不能直接透传或补造 COMPLETE。该接口不是 HTTP，不信任浏览器传入已编辑文档；后继领域服务负责候选重算、语义校验及真实 OPL/Trace 生成，Repository 不冒充完成这些职责。

内部完整文档保留 seed 的历史 Revision 元数据作为还原容器，不代表草稿是该 Revision；不得对外作为已提交 Revision 返回。编辑禁止修改 schema_id/schema_version/model_id/profile_binding/schema_set_ref/revision_id/revision_sequence/parent_revision_id/model_header.model_id/model_header.root_context_id。保存物化真实历史元数据由后继保存服务负责。

沿用 SQLite WAL、synchronous=FULL、foreign_keys 和 busy_timeout；写事务明确 BEGIN IMMEDIATE，跨 Repository 实例由数据库锁串行，不只依赖 synchronized。严格请求/身份摘要 → 项目模型归属与 V2 模式 → 已有收据核对 → 读取并验证 checkpoint+连续 Journal → expected token/binding → effect → 校验完整输入及不可变字段 → Journal → CAS stream → receipt → COMMIT。失败 ROLLBACK，成功回复只能发生在 COMMIT 后。

不变内容返回 UNCHANGED、同 token、空 affected/text trace IDs，只增加 EDIT receipt，不改草稿及恢复正文；忽略此次重新生成但未持久的派生元数据，保留已有状态。有变化时序号严格 +1，journal.result_digest=SaveContentDigest/1(after document)；每步重放检验两份 delta 摘要、完整模型摘要及对应收据的 command/token/content 关联。成功提交前执行一次存储回读闭包。

第一次未覆盖编辑设置 dirty_since=Clock 当前 UTC 毫秒、deadline=+10秒；后续保持原值。此切片只记录期限，不启动 scheduler。Clock 是构造器注入的 Runtime 时钟，不接受客户端时间。超过安全序号拒绝。journal 不保存整份 after document，不插入 draft_content/checkpoint/savepoint/revision_document，不更新旧 HEAD。

`read(projectId,modelId)` 在一致读事务返回 Snapshot(token,documentJson,contentDigest,dirtySince,deadline)。`receipt(projectId,modelId,request)` 返回 HS-01D FOUND/NOT_FOUND；相同 command_id+digest 重试还须核对收据 base_token 并验证当前重放链，随后返回原结果，只重写 transport request_id；不同 digest 报 IDEMPOTENCY_MISMATCH。错误使用 INPUT_INVALID/NOT_FOUND/DRAFT_MODE_REQUIRED/RULE_VERSION_CONFLICT/DRAFT_CONFLICT/DRAFT_RECOVERY_REQUIRED/PERSISTENCE_FAILED。无效 Proposal 报 INPUT_INVALID，effect 抛出的业务异常原样回传。缺表不能自动初始化；非法 checkpoint、断链、摘要不匹配、未覆盖编辑却丢失 deadline 均 fail closed。

本切片仅从当前 checkpoint 恢复；双 checkpoint fallback、压缩、Undo 会话和 scheduler 属后继。测试可在临时库显式插入模式行验证存储协议；没有生产激活入口。

## 4. Plan 与验收

先交付 delta/逆向与 Schema，再实现 Repository，最后在临时真实 SQLite 验证。测试阶段注入包内 stage hook：JOURNAL/STREAM/RECEIPT/VERIFIED；只在 commit 前调用，不提供 Runtime 配置/API fault port。

- HS-J01：字段级增量、数组、删除/追加、null/缺失、浮点/负零、Unicode、逆向还原、错误摘要/槽零部分修改。
- HS-J02：V3 临时库完成有变化/无变化提交、read/重开；旧 Revision/内容 blob 数不随编辑增长；deadline 不重置。
- HS-J03：响应丢失重试、不同输入同 ID、旧 token、绑定、模式和跨项目拒绝。
- HS-J04：四个 commit 前故障点均全回滚；两个 Repository 实例并发仅一个 expected token 成功。
- HS-J05：checkpoint/Journals/receipt 篡改、断链 fail closed；生成契约、迁移准备及摘要定向回归。

回滚只回退本切片源码及文档，保留前序差异。临时测试数据不替换用户库；本轮不提供任何数据库降级或清理命令。不得将异常注入回滚称为 OS 强停验证。
