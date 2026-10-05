# HS-04A 受控副本激活与迁移回读

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：backend-springboot (primary)、db-migration、testing。状态：设计冻结，副本激活实现与隔离验收完成（2026-09-14）。

## 1. 目标与边界

承接 HS-01C 的 PREPARED 和 HS-03B 的工作台，交付可独立验证的 ACTIVATED_COPY。只在全新输出根的项目副本内注册 V4/V5、验证内容和当前 Runtime 消费能力、事务写入模型模式；不修改输入准备根、原始数据库或用户服务，不安装、替换源库、不新增 HTTP/CLI/启动扫描。此输出是固定快照的激活输入，不能证明 live HEAD 未变化。正式安装必须另行停写、备份并重验源 HEAD/binding，禁止直接覆盖运行中的数据库。

当前目录开发，保留全部前序差异，不建 worktree、不提交。仅 SQLite，复用 Flyway 与现有依赖。允许16项：本规格；`docs/checklists/opm-hybrid-save-activation-copy-checklist.md`；总实施规格/Checklist和保存设计；保存 Schema；生成Java/TS/OpenAPI（三份，由原生成器生成，OpenAPI内容不得改变）；`scripts/draft-save-contract.test.mjs`；新增 `application/HybridSaveActivation.java`、`storage/ActivatedDraftRepository.java`、`storage/ActivatedDraftRepositoryTest.java`、`application/HybridSaveActivationTest.java`；修改 `storage/PreparedDraftRepository.java`（仅增加 activated read守卫）；修改 `storage/HybridSavePreparationTest.java`（仅将既有真实旧库fixture开放给同测试模块复用）。Java路径均在 `services/local-runtime/src/{main,test}/java/org/opm/localruntime/` 对应目录。

禁止修改原SQL、公共HTTP、Profile业务字节、用户库、前端、默认迁移配置、依赖、历史发布证据。不会以成功副本报告声称线上迁移/完整ISO符合性或强停/容量完成。

## 2. 输入、输出和唯一机器口径

接口 `HybridSaveActivation(LocalApiService domain, FileProfilePackageLoader loader).activate(preparationRoot, outputRoot, migrationRoot, DraftActivationRequest)` 与 `verify(outputRoot)`；不装配Spring Bean。migrationRoot明确为 `docs/contracts/migrations` 的物理输入路径，不通过环境或目录搜索定位。

DraftActivationRequest：`preparation_report_sha256`、`activated_at`，全部必填。摘要为准备根report.json的原始文件SHA-256；时间用既有UTC毫秒规则且不得早于准备时间。身份全部来自通过HS-01C verifier的报告，不另造project/model/revision/draft/checkpoint身份。

固定输出：`preparation/{backup.sqlite,prepared.sqlite,report.json}` 为逐byte镜像；`storage/projects/<project_id>/project.db` 为迁移和激活副本；`report.json` 唯一完成标记。所有叶子和受控子目录拒绝符号链接；根父目录可canonical化支持系统/tmp别名。禁止输出位于输入准备根内部；输出根排他创建，不覆盖。已有完整输出仅在独立verify且Request一致时幂等返回；失败根不续写、不清理。

DraftActivationReport：`schema_id=OPM-DRAFT-ACTIVATION`、`schema_version=0.1`、`status=ACTIVATED_COPY`、`request`、`preparation`（完整DraftPreparationReport）、`database_sha256`、`database_bytes`、`context_count`、`readback_digest`，全部必填，additionalProperties=false。生成器复用现有保存Schema；无新增HTTP路径。

readback_digest为SHA256(UTF8(JCS({version:"DraftActivationReadback/1",contexts:[...]})))；contexts按Context ID的Java String自然序排序，各项固定 `context_id/projection_sha256/opl_sha256/trace_sha256`。projection_sha256冻结为SHA256(UTF8(JCS({version:"DraftActivationProjection/1",data:normalize(projectionData)})))。normalize保留当前纯projectionData所有字段、null及数组顺序，递归仅将Java Float/Double替换为{ $binary64: 既有ProjectionDigestV01.binary64Hex(value) }，非有限数拒绝；整数交给既有安全整数JCS守卫。不能使用缺少target_kind的发布ProjectionDigest/0.1，也不能删字段凑旧形状，OPL/Trace复用OplGoldenArtifactCanonicalWriter原始canonical bytes。完整原始文档仍须无损值等价，避免投影忽略字段导致误通过；禁止把上述摘要当成新公共Projection契约。对备份源文档及激活后Journal读回文档分别生成并逐项等价，验证active binding、核心语义、每个Context文本写入证据和所有Fact至少有一个OWNED occurrence。不支持的Context/资产/语义拒绝激活，不声明完整规则包通过。

## 3. 唯一顺序与事务

完整文档等价的数值口径沿用 `DraftJsonDelta.read`：两侧全部原始字段递归比较，整数2和浮点2.0为同一binary64值，正负零不同；不能用Jackson不同NumberNode子类直接equals导致合法回读被拒绝，也不能只比较排除元数据的SaveContentDigest。备份与旧revision_document仍保留原始JSON字符串，不重写原文。

先校验request、准备report raw SHA及HS-01C完整verify、时间和输出拓扑；先生成源文档的消费摘要。排他创建输出→复制三文件→再次verify镜像及raw SHA→复制prepared为project.db→校验冻结V1~V5 SQL集合→仅副本Flyway target5（validate，不repair）→单事务检查原表保留、draft初始值并插入唯一模式行→commit→新连接读回及Journal恢复→全Context摘要比较→封闭报告。

V1/V2/V3 SHA沿用HS-01C。V4=`ce9e980bfdd81b5ee5bdf5f81faad5568262f8b577e922fa69bc44a888a040b4`；V5=`01c6fc818a03a13feb2af819c31c8ba7664b58e372b0f09cab7a17bb498e4665`。显式三位置sqlite、sqlite-checkpoint、sqlite-pin；仅版本1~5。不更改storage_schema_version既有值，由原迁移决定。

mode精确一行(model_id,JOURNALED_DRAFT_V2,draft_id)；Journal/Receipt/Savepoint/Retention/Overlay仍为空，seed三表仍各一行，seq=0，HEAD/旧版本/引用原样保留。`PreparedDraftRepository.read`保留默认未激活断言；新增显式activated模式供本库使用，禁止放宽原准备verifier。

mode插入前/后/commit前包内测试回调可抛错，全部事务回滚；DDL只影响隔离副本。commit后后续回读/报告失败保留无完成标记的失败根，绝不修改源或伪造成功。数据库checkpoint/truncate并转DELETE、拒绝sidecar，fsync数据库与目录；report.pending以CREATE_NEW写入/fsync→原子rename→根fsync。最后目录fsync失败结果未知，必须verify，不盲重建。

独立verify必须重验镜像、raw SHA/长度、实际mode及seq和三表、完整旧表比较、Journal读回和当前资产下摘要；不能仅信任报告。verify要求副本尚未被Runtime编辑。使用时须复制到独立可写运行根；已编辑运行库不再匹配该不可变报告。

稳定错误码 `DRAFT_ACTIVATION_INPUT_INVALID/PREPARATION_MISMATCH/OUTPUT_EXISTS/SCHEMA_MISMATCH/CONTENT_MISMATCH/VALIDATION_BLOCKED/PERSISTENCE_FAILED`；失败不生成成功报告，cause仅诊断。已有prepare/repository错误由本服务边界映射，不泄露为另一协议的成功。

## 4. Plan、验收与回滚

Plan：闭合Schema→生成类型→存储迁移/事务/独立读回→应用消费等价/完成标记→真实旧库和失败矩阵→记录证据。边界确认见独立Checklist。

- HS-A01：Schema正反例、Java封闭解码、生成契约检查，既有保存公共路径不变。
- HS-A02：真实V1/V2准备→V5副本激活→独立verify，源raw SHA不变、旧HEAD/历史/Snapshot/Baseline保留，多Context及负零/扩展字段不丢。
- HS-A03：缺输入/错SHA/时间/资产/binding/非法语义/符号链接/既有失败根拒绝；重算文件SHA后的逻辑漂移仍拒绝。
- HS-A04：插mode前后/commit前故障事务回滚，无成功report；成功重复调用无重复行。
- HS-A05：复制成功输出到独立测试运行根，通过真实V2 open/编辑/MANUAL/Pin/EXACT重开，V1旧命令拒绝；不使用测试手插mode替代激活。
- HS-A06：定向Java与保存/准备回归、Node契约、前端生成类型typecheck、diff/文件/链接检查，记录未执行项。

回滚只撤本包增量；源/准备根未改，失败输出保留。禁止恢复备份覆盖已有新编辑，禁止把输出自动安装到用户存储。在线切换、操作系统强停、20,000次容量与压缩/Undo为后继。

实现验证边界：现有V1命令被SQLite旧写入守卫拒绝，LocalApiService暂映射为PERSISTENCE_FAILED，不是专用“请升级客户端”错误。HS-A05验证拒绝及零旧Revision提交，不宣称升级提示完成；在线安装切片必须先完成该公共错误映射及停写/恢复协议。本包未注册任何线上激活入口。
