# HS-04B 开发数据重置与新模型默认混合保存

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：backend-springboot (primary)、db-migration、testing。状态：设计冻结，HS-R01～05 实现及开发环境验收完成（2026-09-14）。

## 目标和授权

用户明确授权清空未上线开发数据，不要求保留历史。当前目录开发，不创建 worktree、不提交。将实际 Runtime 的新建项目初始化为 V1～V5，新建模型同事务启用 JOURNALED_DRAFT_V2；编辑写日志，手动保存和 Runtime 10 秒自动检查点沿用现有实现。

本授权取代 HS-04A 对本地用户开发库的禁止安装边界，但不授权改动 Profile、发布证据或其他存储根。只处理已核实的 `runtime-data/projects`（4 个开发项目）；停止对应 17850 Runtime 后可恢复地移至排他创建的临时目录，重新建立空目录并启动新 JAR。5173 Vite 保留，工作台转到项目列表。最终活动项目列表为空。

## 修改范围和契约

允许本规格、对应 checklist、保存设计、总实施 checklist；Runtime 的 `ProjectDatabaseFactory`、`FlywayProjectSchemaMigrator`（显式禁止隐式升级）、`StorageConfiguration`、新增 `NewDraftModelRepository`、`LocalApiService` 的新建路径及初始 Revision 序列化、`pom.xml` 资源、`NewDraftModelTest`、`ProjectDatabaseFactoryTest` 的现有 V2 基线断言和后继故障迁移版本。允许构建派生产物与上述开发数据重置。禁止更改 SQL 原文、公共 HTTP/Schema、依赖、前端业务、其他未提交改动、历史发布链。

Spring 工厂显式使用 `ProjectDatabaseFactory.journaledDrafts(root)`，仅全新项目库应用既有 V1/V2、V3、V4、V5 的四个独立 classpath 位置。程序化旧构造器保持原 V1/V2 测试/发布语义。新模式再次打开已有库只验证完整 V1～V5，不隐式迁移旧库。

新模型初始 Revision 保持真实 MS-REV-001/0.2 原始 JSON。model_catalog 和 revision_document 的 binding 均为文档中的完整 profile_binding 对象，schema_version 为 0.2（修正旧字段误写）；无 schema_set_ref 时原 schema_set_json 保持空对象。

`NewDraftModelRepository.initialize(connection, projectId, modelId, revisionId, now)` 在调用方新建事务内读取 exact 初始文档，复用 PreparedDraftRepository.source/seed 和 SaveContentDigest/1。生成独立 draft/checkpoint 稳定 ID，UTC 毫秒时间；seed 的 edit_seq/covered_seq=0，dirty_since/deadline=null，mode 最后插入。使用按 model 的 Journal scope/load 校验，不使用要求全库只有一个模型的副本 verifier。model/initial revision/head/seed/mode/idempotency/operation 任一失败全部回滚；同 command 重试复用原模型。禁止在请求内执行 DDL。

## Plan 与验收

顺序：打包既有迁移资源→新库工厂→同事务新模型 seed→隔离 SQLite 回归→构建 JAR→停止实际 Runtime/移开精确开发库→重启和实际 HTTP 验证。

- HS-R01：新库完整五个版本、重复打开稳定；旧工厂行为保留，新工厂拒绝隐式升级已有旧库。
- HS-R02：同项目两个新模型分别可 V2 open；幂等重试无重复；编辑不增加旧 Revision，保存/重开内容一致。
- HS-R03：mode 插入故障导致整个新模型回滚，可重试；binding/原始文档摘要一致。
- HS-R04：实际打包 JAR 的新建/编辑/保存/重复无修改保存与自动检查点验证；停止后重开可回读。测试数据最终移出活动根。
- HS-R05：实际四旧项目已移出；Runtime health、5173 前端、代理 API、bootstrap 和空项目列表验证通过。

回滚：新代码只撤本包差异；旧项目在临时目录可恢复，必须先停止 Runtime，且不得覆盖任何后来产生的新项目。仅 SQLite 开发环境，不声称生产迁移、容量/强停或全设计验收。
