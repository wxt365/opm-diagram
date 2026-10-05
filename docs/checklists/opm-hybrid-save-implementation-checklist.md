# 混合保存实施 Checklist

规格：[实施任务](../../specs/opm-hybrid-save-strategy-implementation-task-spec.md)。

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。

## 已交付切片 HS-04B

规格：[开发重置与新模型默认混合保存](../../specs/opm-hybrid-save-development-reset-task-spec.md)；[独立验证记录](opm-hybrid-save-development-reset-checklist.md)。

- [x] HS-R01~04：用户授权放弃开发历史，Spring 新建默认 V5/V2，同事务 seed；Java 9 类97项最终通过，真实5173浏览器保存/自动检查点/刷新和Runtime重启回读通过。
- 本切片取代当前开发环境必须先迁移旧库的部署前提；旧数据移出，最终空库与服务检查见独立记录。其他历史报告中的“未改用户库”仅指其当轮范围。未声称强停、容量或全设计实现完成。

## 已交付切片 HS-04A

规格：[受控副本激活](../../specs/opm-hybrid-save-activation-copy-task-spec.md)；[独立验证记录](opm-hybrid-save-activation-copy-checklist.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。

- [x] HS-A01~06：完整16项文件与边界引用独立记录；当前目录，不修改源/用户库、不装配线上切换。
- Java21/SQLite：10类83/83；Node保存契约7/7；两份生成器、前端typecheck通过。新测试8项包含两个旧schema、多Context、原表/历史不变、输入错误、重算hash后的逻辑漂移、三处事务故障、激活后真实编辑/保存/Pin/历史读取。
- 独立ACTIVATED_COPY并非已安装；原库、服务与运行模式没有切换。V1写入拒绝当前仍为PERSISTENCE_FAILED，专用升级提示、停写/安装/恢复、强停和容量属于后继，不标记全部HS-04完成。

## 已交付切片 HS-03B

规格：[工作台草稿与显式保存](../../specs/opm-hybrid-save-workbench-task-spec.md)；[独立验证 Checklist](opm-hybrid-save-workbench-checklist.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

- [x] HS-W01~05：范围和完整16项文件集合引用子规格；当前目录，保留前序差异，不改用户数据库。
- 2026-09-14：Web 202/202；真实 Runtime/临时SQLite/Chromium 5/5（V2三项、V1兼容两项）；Java临时夹具1/1；typecheck、lint、Node22 build、两份生成契约检查通过。十三类命令的生成 payload 由Session单测覆盖，不冒充逐命令浏览器证明。
- 已接保存按钮、Ctrl/Cmd+S、Runtime自动保存状态、Pin永久链接、同token草稿读取/授权及原收据恢复；真实响应丢失不重复编辑、保存迟到不回滚新编辑。截图确认桌面单排及窄屏保存可达，没有移动端布局重构。
- 未执行生产模式切换、用户库迁移/激活、OS强停或容量验收。确定失败的待确认输入仍只支持原请求恢复，显式放弃/修正属于后继；不能称混合保存全流程或HS-04完成。

## 已交付切片 HS-03A

规格：[浏览器草稿传输与待确认恢复](../../specs/opm-hybrid-save-browser-delivery-task-spec.md)；[独立验证 Checklist](opm-hybrid-save-browser-delivery-checklist.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

- [x] HS-B01~05：范围、验收与完整12项文件集合引用子规格；当前目录，保留既有差异，不改用户库或工作台模式。
- 2026-09-14：Web 169/169、真实 Chromium IndexedDB 7/7、Node 契约14/14；typecheck、lint、Node22 build 通过。
- V2 API、无损 raw 请求/摘要、strict IDB 两通道、收据恢复已实现。浏览器 HTTP 使用受控替身，不能当作 Runtime/SQLite 或用户模型联调证据。
- 保存按钮/Ctrl+S/Pin 链接、工作台 V2 token 接入、模式切换、显式处理失败队列及恢复容量仍未交付。原页面仍使用 V1，不宣称混合保存整体完成。

## 已交付切片 HS-02I

规格：[固定版本 Pin](../../specs/opm-hybrid-save-pin-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。Pin 的保留引用依赖迁移修复，三项不可拆开验证。

- [x] 边界与 Plan：规格第1、4节；当前目录，API Schema/V1~V4 SQL/用户库/前端不变；独立 V5 仅用于临时测试库。
- [x] HS-P01：四用途精确捕获/去重、MANUAL 隔离、更晚编辑保留、HTTP 历史投影/文本重开。
- [x] HS-P02：幂等和并发单提交、旧 Journal/检查点移除后重试、坏收据/引用/blob 拒绝、七阶段/真实 SQL 故障回滚。
- [x] HS-P03：MANUAL/PIN FIFO、显式请求先于 AUTO、在途 PIN 状态及关闭、pending_manual_target 不混入 Pin。
- [x] HS-P04：严格 wire、安全三项、模式/V4/V5/模型/token/资产错误、Node/Java 摘要、相关回归和文档/文件检查。

2026-09-14 实际验证（当前目录，基线 HEAD=2180f38，保留既有未提交差异，未创建 worktree 或提交）：

- Java21：`JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=DraftPinRepositoryTest,OplMultiContextTest,OplTextGenerationServiceTest,OplGoldenReplayRunnerTest,DraftSaveControllerTest,DraftSaveServiceTest,DraftHistoryRepositoryTest,DraftSaveRepositoryTest,DraftSaveCoordinatorTest,DraftJournalRepositoryTest,DraftWorkspaceControllerTest,HybridSaveFoundationMigrationTest,HybridSavePreparationTest,DraftJsonDeltaTest,SaveContentDigestV1Test,DraftWorkspaceContractTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest test`：313/313，失败/错误/跳过零。新增13项（Pin 存储/迁移7、协调器2、HTTP3、摘要1）；先前定向47项不重复累计。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：22/22；含新增 Pin 固定摘要向量。
- `npm run typecheck --workspace=@opm/web`、Save/Workspace 两份 generator `--check`、`git diff --check`、本包21项文件空白/换行和5份文档本地链接检查通过。Java/TS 生成输出没有字段变化，OpenAPI 同步 Pin 已实现状态。
- 首轮实际 Pin SQL 拒绝 min_edit_seq=null，查明 V3 可空字段的 typeof CHECK 冲突；按子规格新增独立 V5 后验证正向/重复迁移、旧引用逐字段不变、非法值/FK拒绝。完整 V5 SQL 之后注入事务内故障，真实 Flyway 迁移回滚，原引用保留，随后原迁移重试成功。原 V1~V4 不改，V4 的 Save/AUTO 回归保持通过；Pin 缺 V5 稳定拒绝。
- 未执行用户库迁移或激活、浏览器、OS 强停和容量/迁移锁时长验证。Pin 固定用途不代表 Snapshot/Baseline/Export 消费者已经接入。后继先接前端保存/固定版本交互及受控模式切换，不能直接在用户库补模式行。

本包完整文件集合（21项，含两份仅重新生成校验且内容不变的 Java/TS 输出）：

1. `specs/opm-hybrid-save-pin-task-spec.md`
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. `specs/opm-hybrid-save-http-history-task-spec.md`
6. `docs/contracts/migrations/sqlite-pin/V5__pin_retention_nullable_sequence.sql`
7. `scripts/generate-draft-save-contract.mjs`
8. `scripts/draft-save-contract.test.mjs`
9. `apps/web/src/shared/api/generated/draftSaveContract.ts`
10. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java`
11. `docs/contracts/openapi/opm-draft-save-v02.json`
12. `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftCapabilityIdentity.java`
13. `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftSaveController.java`
14. `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveCoordinator.java`
15. `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveService.java`
16. `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSaveRepository.java`
17. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java`
18. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftCapabilityIdentityTest.java`
19. `services/local-runtime/src/test/java/org/opm/localruntime/application/DraftSaveCoordinatorTest.java`
20. `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftPinRepositoryTest.java`
21. `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftWorkspaceTestDatabase.java`

## 已交付切片 HS-02H

规格：[多 Context 文本与保存](../../specs/opm-hybrid-save-context-text-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

- [x] 边界与 Plan：规格第1、3节；当前目录，无用户库迁移或 Profile/SQL/API 变更。
- [x] HS-C01：四种 Context、空图及未知/Profile/悬空/跨图/重复/遗漏/必要 owner 拒绝边界。
- [x] HS-C02：Legacy/ISO 按图筛选、共享 Fact、State/Control/Structural、非根身份/source 隔离和根 golden 回放。
- [x] HS-C03：两个非空 OPD 整模型保存、空图保存、共享对象改名后新旧历史/重开隔离；损坏子图与孤立 Fact 零部分保存。
- [x] HS-C04：Java300项、Node21项、Web 类型及文件/文档检查通过；未运行浏览器、用户迁移、OS 强停或容量验证。

2026-09-14 实际验证（当前目录，未提交）：

- Java21：`JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=OplMultiContextTest,OplTextGenerationServiceTest,OplGoldenReplayRunnerTest,DraftSaveControllerTest,DraftSaveServiceTest,DraftHistoryRepositoryTest,DraftSaveRepositoryTest,DraftSaveCoordinatorTest,DraftJournalRepositoryTest,DraftWorkspaceControllerTest,HybridSaveFoundationMigrationTest,HybridSavePreparationTest,DraftJsonDeltaTest,SaveContentDigestV1Test,DraftWorkspaceContractTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest test`：300/300，失败/错误/跳过零。包含文本170、golden回放2、保存HTTP11及相关存储/宿主/旧接口回归117；此前定向文本/HTTP181项已通过，不与最终300重复累计。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：21/21；`npm run typecheck --workspace=@opm/web` 通过。
- `git diff --check`、本包12份文件换行/空白和6份文档的本地链接检查通过；没有修改 Profile/Golden bytes。
- 首轮回归发现旧端点反例的 occurrence 指向被替换前的 Fact ID，以及旧 Legacy fixture 遗留不在 Context 清单的 occurrence。按规格第3节修复测试输入，保留错误码断言，随后重跑上述完整回归通过。
- 全部 SQLite 均为临时测试库；当前用户模型未切换。完整引用视图语义、Context CRUD/多图删除、Pin、前端保存、迁移及恢复容量仍待后继。

本包完整文件集合（12项）：

1. `specs/opm-hybrid-save-context-text-task-spec.md`
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. `specs/opm-hybrid-save-http-history-task-spec.md`
6. `docs/design/opm-symbol-and-text-generation-implementation-contract.md`
7. `services/local-runtime/src/main/java/org/opm/localruntime/text/OplTextGenerationService.java`
8. `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveService.java`
9. `services/local-runtime/src/test/java/org/opm/localruntime/text/OplTextGenerationServiceTest.java`
10. `services/local-runtime/src/test/java/org/opm/localruntime/text/OplMultiContextTest.java`
11. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java`
12. `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftWorkspaceTestDatabase.java`

## 已交付切片 HS-02G

规格：[保存 HTTP 与历史读取](../../specs/opm-hybrid-save-http-history-task-spec.md)。

- [x] 边界：规格第1节；直接当前目录，既有 SQL/用户库/前端/发布证据不变。
- [x] Plan：规格第4节。
- [x] HS-H01：保存后 EXACT workspace/projection/text、真实重命名后旧内容不变、旧历史序号合并、宿主重建后重开。
- [x] HS-H02：旧 token/重复 save_id/UNCHANGED、AUTO 零历史；删除临时库 Journal/checkpoint 后历史仍独立可读；blob 损坏、错模型及全局序号上界拒绝。
- [x] HS-H03：POST Save/GET SaveState 的 Host/Origin/session、严格词法、错误模式/V4/资产/绑定/token、真实 SQL 失败回滚与重试。交付时非根 Context 按既有 OPL 范围阻断，根无 Fact 保存通过；该历史 Context 范围由 HS-02H 替代。
- [x] HS-H04：真实 executor、重复按需注册、过期 deadline 自动保存、宿主关闭/重开、Spring 注入与销毁；原可控10秒协调器测试通过。
- [x] HS-H05：Java126项、Node21项、Web typecheck 和差异/生成检查通过；未运行浏览器/用户库迁移/强停/容量。

2026-09-14 实际验证（当前目录，未提交）：

- Java21：`JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=DraftSaveControllerTest,DraftSaveServiceTest,DraftHistoryRepositoryTest,DraftSaveRepositoryTest,DraftSaveCoordinatorTest,DraftJournalRepositoryTest,DraftWorkspaceControllerTest,HybridSaveFoundationMigrationTest,HybridSavePreparationTest,DraftJsonDeltaTest,SaveContentDigestV1Test,DraftWorkspaceContractTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest test`：126/126，失败/错误/跳过零。新增14项（HTTP9、宿主2、历史3）。随后补强历史测试为非零 Journal 后删除 Journal/checkpoint，定向重跑历史3/3通过；不是生产清理或强停证明。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：21/21；生成器 check/OpenAPI、Node 契约及摘要通过。
- `npm run typecheck --workspace=@opm/web`、`git diff --check`、两份 generator `--check`、本包29份文件空白/换行和4份文档链接检查均通过。所有 SQLite 为临时测试库。
- HTTP 联调实测发现 token 输出 1.0 与严格 SaveRequest 冲突，已按子规格补充唯一整数输出后回归。交付时多 Context 测试确认旧 OPL root-only 守卫，保持真实拒绝；后继 HS-02H 的独立回归见上节，不改写此轮历史测试结果。

本包文件集合（29项，含5份 workspace 重新生成/校验的输出；无内容变化的生成物不代表功能修改）：

1. `specs/opm-hybrid-save-http-history-task-spec.md`
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. `docs/contracts/schemas/opm-draft-save-v02.schema.json`
6. `scripts/generate-draft-save-contract.mjs`
7. `apps/web/src/shared/api/generated/draftSaveContract.ts`
8. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java`
9. `docs/contracts/openapi/opm-draft-save-v02.json`
10. `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
11. `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
12. `docs/contracts/openapi/opm-draft-workspace-v02.json`
13. `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
14. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
15. 主 Java `storage/DraftSaveRepository.java`
16. 主 Java `storage/DraftHistoryRepository.java`
17. 主 Java `semantic/DraftSemanticView.java`
18. 主 Java `application/DraftSaveService.java`
19. 主 Java `application/DraftSaveCoordinator.java`
20. 主 Java `application/DraftWorkspaceService.java`
21. 主 Java `application/LocalApiService.java`
22. 主 Java `api/DraftSaveController.java`
23. 主 Java `api/DraftSaveExceptionHandler.java`
24. 主 Java `api/LocalWriteRequestGuard.java`
25. 主 Java `api/DraftWriteRequestGuard.java`
26. 主 Java `api/DraftWorkspaceController.java`
27. 测试 Java `api/DraftSaveControllerTest.java`
28. 测试 Java `application/DraftSaveServiceTest.java`
29. 测试 Java `storage/DraftHistoryRepositoryTest.java`

主/测试 Java 根：`services/local-runtime/src/{main,test}/java/org/opm/localruntime/`。完整功能边界和后继项见子规格第1、4节及总设计第20节。

## 已交付切片 HS-02F

规格：[保存事务与协调器核心](../../specs/opm-hybrid-save-coordinator-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。三项因事务依赖检查点差量迁移、并发调度和测试不可分割。

- [x] 范围和边界：规格第 1 节，直接当前目录，不修改已有迁移/用户库或公开未接入的保存入口。
- [x] Plan：规格第 5 节。
- [x] HS-S01：临时 V3→V4、重复迁移、FK、overlay UPDATE/REPLACE 拒绝；V3 保存拒绝且不自动建表；旧准备流程回归通过。
- [x] HS-S02：AUTO、首次 MANUAL/连续保存、AUTO 后手动、撤销及 ABA，内容/历史/覆盖计数和幂等符合规格。
- [x] HS-S03：同内容不同元数据 overlay、负零、旧 token 捕获、保存后重放、指针不回退；缺 overlay/错误摘要拒绝。
- [x] HS-S04：六阶段异常、真实 SQL 收据写失败全回滚；两个实例同 ID 并发只有一个保存事件；错历史收据拒绝。
- [x] HS-S05：可控30秒三次AUTO、手动优先/在途AUTO、精确捕获、退避、墙钟跳变、恢复暂停及关闭；真实 executor 启停和 SQLite adapter 通过。
- [x] HS-S06：相关 Java 回归、Node21项、生成/类型检查与本包文件检查通过；没有公开保存 HTTP 或启用用户库。

2026-09-14 实际验证（当前目录，未提交）：

- Java 21：`JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=DraftSaveRepositoryTest,DraftSaveCoordinatorTest,DraftJournalRepositoryTest,DraftWorkspaceControllerTest,HybridSaveFoundationMigrationTest,HybridSavePreparationTest,DraftJsonDeltaTest,SaveContentDigestV1Test,DraftWorkspaceContractTest,DraftCapabilityIdentityTest test`：相关回归79项通过。随后增加收据引用和恢复暂停守卫，定向重跑 `-Dtest=DraftSaveRepositoryTest,DraftSaveCoordinatorTest`：20/20；最终覆盖合计81个不同测试，失败/错误/跳过均零。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：21/21，通过生成器一致性和既有两端协议检查。另用独立 Node binary64/JCS 计算保存请求固定 SHA，Java 对照通过，输入及预期见规格第3节。
- `npm run typecheck --workspace=@opm/web`、`git diff --check`、本包文件空白/换行和文档链接检查通过。
- 回归发现旧 token 回读错误复用了当前 dirty 判定，修正为先验证 current 再按捕获序号重建；同时发现 V4 被旧准备器扫描，将 V4 移到独立目录后旧 exact 三文件校验保持不变，相关回归通过。
- V4 仅临时测试显式运行；未执行用户库迁移、公共保存 API、浏览器、OS 强停、容量验证或生产启用。核心 callback 的存储测试和真实 Profile/OPL 校验测试分开记录，不将内部回调当作已经装配的公共业务入口。

本包完整文件集合（11项）：

1. `specs/opm-hybrid-save-coordinator-task-spec.md`（新增）
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. `docs/contracts/migrations/sqlite-checkpoint/V4__checkpoint_capture_overlay.sql`（新增，未注册默认资源）
6. `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
7. `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSaveRepository.java`（新增）
8. `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveCoordinator.java`（新增）
9. `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftCapabilityIdentity.java`
10. `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftSaveRepositoryTest.java`（新增）
11. `services/local-runtime/src/test/java/org/opm/localruntime/application/DraftSaveCoordinatorTest.java`（新增）

## 已交付切片 HS-02E

规格：[草稿查询](../../specs/opm-hybrid-save-draft-query-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

- [x] 边界确认：规格第 1 节精确范围；不改 SQL/用户库/Profile/v1 wire/前端，不创建 worktree。
- [x] Plan：规格第 5 节。
- [x] HS-Q01：多 Context 导航、真实名称/分组/排序和未知 Context 拒绝；平铺而非推断细化树。
- [x] HS-Q02：34 项目录、exact Symbol 资产身份、Fact/occurrence/null/Structural 选择与非根禁用；删除后旧选择失效。
- [x] HS-Q03：真实全模型诊断、跨视图/重开稳定 ID、排序及去重；Node/Java 固定摘要一致，覆盖计数/重复 ID/范围篡改拒绝。
- [x] HS-Q04：旧 token/错误绑定/缺资产/非法请求或选择拒绝，当前数据和重开一致；查询零新增 Journal/receipt/Revision/checkpoint/content。
- [x] HS-Q05：v1 和草稿相关回归、生成一致性、Web typecheck、差异及本包文件检查通过；未启用用户库。

2026-09-14 实际验证（当前目录，未提交）：

- Java 21：`JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=DraftWorkspaceControllerTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest,DraftJsonDeltaTest,DraftJournalRepositoryTest,DraftWorkspaceContractTest,HybridSavePreparationTest,HybridSaveFoundationMigrationTest,SaveContentDigestV1Test test`：92/92，失败/错误/跳过均零。HTTP 累计 26、身份 3、wire 5、旧 v1 服务/控制器 31、存储/摘要 27。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：21/21。包括 generator --check、OpenAPI 结构检查、62 份既有拒绝向量和新增查询正反例。
- `npm run typecheck --workspace=@opm/web`、`git diff --check` 通过。新查询 owner/规格以及全部本包文件空白/换行、5 份设计文档链接检查通过。
- 首次编译发现 binary64 encoder 为包内方法；在本规格补明身份 owner 后，将 Finding 摘要入口放入既有 api.DraftCapabilityIdentity，保持内部 encoder 可见性，随后上述编译/测试通过。
- 当前累计十三类命令、9/9 草稿路径；高级参数/多 Context 编辑限制不变。下一步实现保存协调器、10 秒 scheduler、MANUAL 优先和去重，再接 Pin/前端。没有浏览器保存、OS 强停、容量或用户库模式切换证据。

本包完整文件集合（23 项；主 Java 根 `services/local-runtime/src/main/java/org/opm/localruntime/`，测试根 `services/local-runtime/src/test/java/org/opm/localruntime/`）：

1. `specs/opm-hybrid-save-draft-query-task-spec.md`（新增）
2. `specs/opm-hybrid-save-draft-workspace-contract-task-spec.md`
3. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
4. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
5. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
6. `scripts/generate-draft-workspace-contract.mjs`
7. `scripts/draft-workspace-contract.mjs`
8. `scripts/draft-workspace-contract.test.mjs`
9. `tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json`
10. 主 Java `application/LocalApiService.java`
11. 主 Java `application/DraftWorkspaceService.java`
12. 主 Java `application/DraftWorkspaceQueries.java`（新增）
13. 主 Java `api/DraftWorkspaceController.java`
14. 主 Java `api/DraftWorkspaceSchema.java`
15. 主 Java `api/DraftCapabilityIdentity.java`
16. 测试 Java `api/DraftWorkspaceControllerTest.java`
17. 测试 Java `api/DraftWorkspaceContractTest.java`
18. 测试 Java `api/DraftCapabilityIdentityTest.java`
19. `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`（生成）
20. `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`（生成）
21. `docs/contracts/openapi/opm-draft-workspace-v02.json`（生成）
22. `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`（生成）
23. 主 Java `api/generated/DraftWorkspaceContract.java`（生成）

## 已交付切片 HS-02D

规格：[关系与删除草稿命令](../../specs/opm-hybrid-save-fact-lifecycle-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

- [x] 范围和兼容边界：规格第 1 节；保留当前差异，不改用户库/v1 wire/Profile/前端。
- [x] Plan：规格第 4 节，先分离授权与纯变更，再接草稿 owner 和定向测试。
- [x] HS-F01：从 active 0.2.0 Golden 为每个 Capability 选择一份代表性 PASS，26 类基础关系全部完成真实 HTTP 创建、同值更新、删除、OPL/Trace 与重开；包括 State 端点、fan、Self-invocation。不是全部 variant 或发布 golden 验收。
- [x] HS-F02：8 类 Control 全部附加/同值重试/移除，不增加第二条 Fact/Occurrence；标签修改、局部端点修改保留未变端点 ID 和 source，真实文本一致。
- [x] HS-F03：伪造端点/角色/ordinal/locator/Capability/version/option、独立 Control、错误 occurrence/方向/标签/modifier、未支持的布局/条件/逻辑组明确拒绝；零部分写入。UPDATE 清空逻辑组也明确拒绝，不静默忽略。
- [x] HS-F04：Fact、Object/Process、State、Attribute/Operation 删除及依赖阻断/显式级联/引用 occurrence 移除通过；impact 绑定 token、Context、真实 OPL/Trace，篡改拒绝，幂等/过期 token 验证通过；多 Context 删除明确禁用。
- [x] HS-F05：相关 v1/草稿/Journal/摘要、Node 生成检查及前端类型检查通过。测试全部使用临时 SQLite，没有改动用户数据库。

2026-09-14 实际验证（当前目录，Git 基线 `2180f3823a547878f15c6dd2d2b11030718a0efa`，未提交）：

- Java 21：`./mvnw -q -pl services/local-runtime -Dtest=DraftWorkspaceControllerTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest,DraftJsonDeltaTest,DraftJournalRepositoryTest,DraftWorkspaceContractTest,HybridSavePreparationTest,HybridSaveFoundationMigrationTest,SaveContentDigestV1Test test`，85/85，失败/错误/跳过均零。本包新增 HTTP 7 项（累计 21，含 26/8 循环矩阵）和 impact identity 1 项。随后收紧 UPDATE logical_groups 并增加拒绝断言，重跑 HTTP 21/21。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：20/20；包含独立 Node/Java DraftDeleteImpact/1 固定摘要及 IMPACT_TOKEN_STALE 闭包。
- `npm run typecheck --workspace=@opm/web`、`git diff --check`、本包新增文件空白/换行和文档链接检查通过。
- 首次旧 v1 回归暴露错误判断顺序变化，恢复领域错误先于旧授权的检查顺序后通过；26 类矩阵暴露 reciprocal 目录方向冲突，先修正规格再改目录；impact 拒绝测试暴露 reason enum 缺项，补冻结输入后由 generator 同步，最终测试通过。
- 本轮修正影响：v1/v2 reciprocal 候选统一 UNDIRECTED；v2 新增 IMPACT_TOKEN_STALE reason。Schema 形状、SQLite、Profile bytes 和用户库不变。未执行浏览器/强停/容量/生产模式切换。
- HS-02D 交付时累计 13 类命令、6/9 条路径；后续三条查询已由本文件 HS-02E 接通，高级参数和多 Context 删除边界仍适用。

本包完整文件集合（18 项；主 Java 根 `services/local-runtime/src/main/java/org/opm/localruntime/`）：

1. `specs/opm-hybrid-save-fact-lifecycle-task-spec.md`（新增）
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. 主 Java `application/LocalApiService.java`
6. 主 Java `application/StructuralLinkCatalog.java`
7. 主 Java `application/DraftWorkspaceService.java`
8. 主 Java `application/DraftFactEdits.java`（新增）
9. 主 Java `api/DraftCapabilityIdentity.java`
10. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
11. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftCapabilityIdentityTest.java`
12. `scripts/generate-draft-workspace-contract.mjs`
13. `scripts/draft-workspace-contract.test.mjs`
14. `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`（生成）
15. `docs/contracts/openapi/opm-draft-workspace-v02.json`（生成）
16. `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`（生成）
17. 主 Java `api/generated/DraftWorkspaceContract.java`（生成检查，bytes 不变）
18. `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`（生成）

## 已交付切片 HS-02C

规格：[Feature 与 State 草稿命令](../../specs/opm-hybrid-save-owned-construct-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

- [x] 范围：规格第 1 节；不改 SQL/用户库/Profile/v1 wire/前端；直接当前目录，保留已有差异。
- [x] Plan：按规格第 5 节，先修正字段约束再接领域与授权。
- [x] HS-O01：Object/Process 各创建 Attribute/Operation，两类 Feature State 创建和改名/角色更新、Object State 创建；owner/context 和 Profile 资产闭合。
- [x] HS-O02：四种 State presentation、重复操作、隐藏后的旧 occurrence 拒绝、Feature State 恢复角色与指定布局、服务重开通过；State-specified Fact 在改名/隐藏/恢复后真实 OPL/Trace 一致。
- [x] HS-O03：跨 owner/目标/Context、伪造 option、错误 Capability/version/role/ownership、Process State、旧 token、空白/257 字符/ordinal 全部拒绝且零部分写入。首测纠正跨 Context 应由既有 wire invariant 返回 400 的测试预期，规格同步后重验通过。
- [x] HS-O04：namespace/source/normalization/owner optional 存在性、几何/route_points/负零保持；缺省展示和角色不因 no-op 补值；重试不增 Journal。创建及编辑 13 次时仅 Journal 增加 13 行，Revision/content/checkpoint 各保持 1 行。
- [x] HS-O05：v1、HTTP/Journal/摘要、生成器和前端生成类型回归通过；仅临时 SQLite，不改用户库。

2026-09-14 实际验证（Git 基线 `2180f3823a547878f15c6dd2d2b11030718a0efa`，直接当前目录，未提交）：

- Java 21：`./mvnw -q -pl services/local-runtime -Dtest=DraftWorkspaceControllerTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest,DraftJsonDeltaTest,DraftJournalRepositoryTest,DraftWorkspaceContractTest,HybridSavePreparationTest,HybridSaveFoundationMigrationTest,SaveContentDigestV1Test test`，77/77，失败/错误/跳过均零；HTTP 本轮新增 5 项，累计 14 项，内部覆盖多组正反场景。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：20/20，包括 256 Unicode 字符/257 拒绝、ordinal 拒绝、生成一致性与 OpenAPI。
- `npm run typecheck --workspace=@opm/web` 通过；`git diff --check`、本包新增文件空白/换行和文档链接检查通过。
- 未执行浏览器、OS 强停、容量或生产模式切换；累计 10/13 命令及 6/9 路径。下一切片是关系/删除的 DraftToken 候选与 impact 授权，随后补查询、保存调度和前端。

本包完整文件集合（15 项；Java 根 `services/local-runtime/src/main/java/org/opm/localruntime/`）：

1. `specs/opm-hybrid-save-owned-construct-task-spec.md`
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. 主 Java `application/LocalApiService.java`
6. 主 Java `application/DraftWorkspaceService.java`
7. 主 Java `application/DraftOwnedConstructEdits.java`（新增）
8. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
9. `scripts/generate-draft-workspace-contract.mjs`
10. `scripts/draft-workspace-contract.test.mjs`
11. `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`（生成）
12. `docs/contracts/openapi/opm-draft-workspace-v02.json`（生成）
13. `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`（生成）
14. 主 Java `api/generated/DraftWorkspaceContract.java`（生成检查，bytes 不变）
15. `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`（生成）

## 已交付切片 HS-02B

规格：[草稿元素编辑与 HTTP](../../specs/opm-hybrid-save-element-http-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

- [x] 边界：按规格第 1 节精确文件集合；只三类编辑与六条查询/编辑路径，不改 SQL/前端/用户数据，不启用默认 V2。
- [x] Plan：按规格第 5 节；直接当前目录、保留前序差异。
- [x] HS-E01：真实 MockMvc→领域→SQLite 创建 Object/Process、改名、移动、空模型首次创建及重开；四次变化只有四行 Journal，Revision/content/checkpoint 各保持一行，savepoint 为零。
- [x] HS-E02：真实 token 候选重建、伪造选项和跨目标拒绝、旧 token/binding/context 守卫、未实现查询/命令明确拒绝；名称变化反映到真实 OPL/Trace。
- [x] HS-E03：同名、同位置 UNCHANGED；丢失响应重试不增加 Journal；旧 token 和不同请求同 command_id 拒绝；FOUND/NOT_FOUND、dirty/deadline 及 checkpoint token 正确。
- [x] HS-E04：描述/essence/affiliation/namespace/route_points/负零保持；Attribute owned 移动、空模型真实空文本通过；非法 Control 导致文本生成失败与缺失 Profile 均零 Journal/receipt；重新创建服务可重开。DTO 超出 int 范围明确拒绝，不截断。
- [x] HS-E05：raw 重复键/尾随/未知/缺失 body、Host/Origin/session 反例，实际 Spring MVC 配置的 v2 guard 注册通过；所有测试成功/失败响应均经 v2 Schema 验证，v1 回归通过。

2026-09-13 实际验证（直接当前目录，Git 基线沿用 `2180f3823a547878f15c6dd2d2b11030718a0efa`，未提交）：

- Java 21 执行 `./mvnw -q -pl services/local-runtime -Dtest=DraftWorkspaceControllerTest,DraftCapabilityIdentityTest,LocalApiServiceTest,LocalApiControllerTest,DraftJsonDeltaTest,DraftJournalRepositoryTest,DraftWorkspaceContractTest,HybridSavePreparationTest,HybridSaveFoundationMigrationTest,SaveContentDigestV1Test test`：71 项全通过。随后补空模型与未实现命令实际 HTTP 验证，重跑 `DraftWorkspaceControllerTest` 9/9；当前十类合计 72 项，失败/错误/跳过均零。本包新增 10 项（HTTP 9 + identity 1）。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：19/19，包括独立 Node/Java query/option 固定摘要、生成一致性与 OpenAPI 验证。
- `npm run typecheck --workspace=@opm/web`、`git diff --check` 通过；新文件空白/换行和文档链接检查通过。
- 未执行浏览器/OS 强停/容量验收，没有迁移当前用户库。只三类命令和六条路径完成；其余十类命令、三条查询、保存 scheduler/Pin、UI 和双 checkpoint 恢复仍未完成。

本包完整文件清单（23 项；主 Java 根 `services/local-runtime/src/main/java/org/opm/localruntime/`，测试根同路径 `src/test/java/`；既有差异保留）：

1. `specs/opm-hybrid-save-element-http-task-spec.md`
2. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
3. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. 主 Java `application/LocalApiService.java`
6. 主 Java `storage/DraftJournalRepository.java`
7. 主 Java `api/ApiWebConfiguration.java`
8. `scripts/generate-draft-workspace-contract.mjs`
9. `scripts/draft-workspace-contract.test.mjs`
10. `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`（生成）
11. `docs/contracts/openapi/opm-draft-workspace-v02.json`（生成）
12. `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`（生成）
13. 主 Java `api/generated/DraftWorkspaceContract.java`（生成检查后 bytes 不变）
14. `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`（生成）
15. 主 Java `application/DraftWorkspaceService.java`
16. 主 Java `api/DraftCapabilityIdentity.java`
17. 主 Java `api/DraftWorkspaceController.java`
18. 主 Java `api/DraftWorkspaceExceptionHandler.java`
19. 主 Java `api/DraftWriteRequestGuard.java`
20. 主 Java `semantic/DraftTextMetadataWriter.java`
21. 测试 `storage/DraftWorkspaceTestDatabase.java`
22. 测试 `api/DraftWorkspaceControllerTest.java`
23. 测试 `api/DraftCapabilityIdentityTest.java`

## 已交付切片 HS-02A

规格：[草稿增量事务与耐久收据](../../specs/opm-hybrid-save-journal-transaction-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。

- [x] 边界：仅可信内部 Repository/可逆 delta/测试及关联契约；不改 SQL、不装配 HTTP、不迁移用户库。
- [x] Plan：按规格第 4 节；复用 HS-01D 严格 wire 与请求摘要、SaveContentDigest/1、SQLite factory，保留已有差异。
- [x] HS-J01：对象字段、数组尾部增删、缺失/null、Unicode、负零、逆向与前后摘要守卫通过；错误槽不部分修改输入，未变化子树不进入增量。
- [x] HS-J02：两次编辑重开正确、旧 Revision/内容 blob/checkpoint 均保持 1 行、savepoint 0 行；干净/脏状态的 UNCHANGED 不写 Journal，10 秒 deadline 不重置。
- [x] HS-J03：相同请求重试不调用 effect；不同请求同 ID、旧 token、错误 binding、跨项目、V2 旧数据库缺表及 V3 未激活均拒绝；收据 FOUND/NOT_FOUND 通过。
- [x] HS-J04：JOURNAL/STREAM/RECEIPT/VERIFIED 四点故障与真实 SQLite receipt 写入 ABORT 均全回滚；两个 Repository 实例竞争同 token，仅首个提交成功。
- [x] HS-J05：checkpoint、缺失 Journal、派生 delta、receipt、丢失 deadline 均 fail closed；相关协议、迁移和摘要回归通过。

Git 基线 `2180f3823a547878f15c6dd2d2b11030718a0efa`。2026-09-11 实际验证：

- Java 21 执行 `./mvnw -q -pl services/local-runtime -Dtest=DraftJsonDeltaTest,DraftJournalRepositoryTest,DraftWorkspaceContractTest,HybridSavePreparationTest,HybridSaveFoundationMigrationTest,SaveContentDigestV1Test test`：首次相关回归 30/30。随后补 V2 缺表/负零回读、真实 SQL ABORT 用例，定向重跑 `DraftJournalRepositoryTest`：7/7；当前六类测试共 31 项，均无失败/跳过。本切片 10 项（Delta 3 + Repository 7）。
- `node --test scripts/draft-journal-contract.test.mjs scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：18/18 通过，含相关生成检查。
- `git diff --check` 与本轮新增文件空白/换行、文档链接检查通过。
- 仅临时 SQLite；effect 为存储测试函数，不能作为真实候选/语义/OPL 生成证据。未接 HTTP、保存 scheduler、UI、双 checkpoint fallback；未执行 OS 强停或 20,000 次编辑容量验收。默认迁移及用户库均未改变。

完整文件清单（10 项）：

1. `specs/opm-hybrid-save-journal-transaction-task-spec.md`
2. `docs/contracts/schemas/opm-draft-journal-v1.schema.json`
3. `scripts/draft-journal-contract.test.mjs`
4. `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJsonDelta.java`
5. `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
6. `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJsonDeltaTest.java`
7. `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJournalRepositoryTest.java`
8. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
9. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
10. `docs/checklists/opm-hybrid-save-implementation-checklist.md`

## 已交付切片 HS-01D

规格：[草稿编辑与查询契约](../../specs/opm-hybrid-save-draft-workspace-contract-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

- [x] 边界：只新增草稿 wire、生成/校验与摘要 owner；不改旧 handler、SQL、依赖和用户数据库；直接当前目录，保留前序差异。
- [x] Plan：按规格第 5 节执行，复用选定 v1 payload 与既有 binary64/JCS；所有新 wire 生成物封闭校验。
- [x] HS-D01：13 类命令正例及交叉 payload 错配验证通过；拒绝 legacy Consumption、独立 Control 和未知字段。
- [x] HS-D02：九条 OpenAPI 操作、22 个查询/结果正例及 62 个拒绝向量通过；候选 expiry、删除影响、Context 与 EDIT/SAVE/PIN 收据关联校验通过。只验证 wire 及关联，不构成实际模型授权证明。
- [x] HS-D03：重复键（含转义键）、尾随输入、unsafe integer、非有限数、Unicode、可选存在性、defensive copy 通过；Java 首测发现整数词法 -0 丢失，改为从原始数字文本读 binary64 后回归通过。
- [x] HS-D04：Node/Java 使用同一六份 raw 向量，对 exact canonical bytes 和 SHA 逐项比较；request_id 不影响幂等摘要，project/模型上下文、布局符号位和业务字段进入摘要。
- [x] HS-D05：生成检查、OpenAPI 解析、Web 类型检查和相关保存/迁移准备回归通过。

2026-09-11 实际验证（当前目录，Node v22.22.0、Java 21）：

- `node --test scripts/draft-workspace-contract.test.mjs scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：16/16 通过（本切片 5 项）。
- `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=DraftWorkspaceContractTest,DraftSaveContractTest,SaveContentDigestV1Test,HybridSavePreparationTest test`：20/20 通过（4+3+6+7）。
- `node scripts/generate-draft-workspace-contract.mjs --check`、`node scripts/generate-draft-save-contract.mjs --check`、`npm run typecheck --workspace=@opm/web`、`git diff --check`：通过。
- 固定向量由作者生成后冻结；测试不写 expected、不调用向量作者。本轮无 HTTP handler、候选生产器、运行数据库模式切换、UI 保存或强停恢复，未运行对应 E2E；这些仍属于后继 HS-02~04。

完整文件清单（16 项）：

1. `specs/opm-hybrid-save-draft-workspace-contract-task-spec.md`
2. `scripts/generate-draft-workspace-contract.mjs`
3. `scripts/draft-workspace-contract.mjs`
4. `scripts/draft-workspace-contract.test.mjs`
5. `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`（生成）
6. `docs/contracts/openapi/opm-draft-workspace-v02.json`（生成）
7. `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`（生成）
8. `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`（生成镜像）
9. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`（生成）
10. `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceSchema.java`
11. `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftEditRequestIdentity.java`
12. `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceContractTest.java`
13. `tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json`
14. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
15. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
16. `docs/checklists/opm-hybrid-save-implementation-checklist.md`

## 已交付切片 HS-01C

规格：[一致备份与草稿初始化](../../specs/opm-hybrid-save-preparation-task-spec.md)；Git 基线 `2180f3823a547878f15c6dd2d2b11030718a0efa`，保留当前目录前序差异。Plan/精确范围见规格第 5 节。

- [x] 边界：只读源库、独立备份/候选副本、PREPARED 不切 V2、默认 V3 仍未注册；无用户数据库写入。
- [x] HS-C01：含 WAL 的真实备份与源数据不变；保持活跃连接时比较源 db/WAL raw SHA，备份可读 WAL_ONLY 行值。
- [x] HS-C02：V1/V2→隔离 V3、事务初始化与重开；旧 Snapshot/Baseline 指向旧 Revision，原文档 raw JSON 保持。
- [x] HS-C03：输入边界和幂等验证；同根并发在首个事务未提交时稳定拒绝覆盖。
- [x] HS-C04：content/stream/checkpoint 三阶段失败均 rollback、零三表残留、零完成报告；失败根不可续写。
- [x] HS-C05：报告、数据库及内容篡改拒绝；含重新计算候选文件 SHA/大小后，artifact、业务内容、旧表行值变化仍被拒绝。
- [x] HS-C06：生成检查、契约及既有回归通过。

2026-09-11 实际验证：

- Java 21 执行 `./mvnw -q -pl services/local-runtime -Dtest=HybridSavePreparationTest,HybridSaveFoundationMigrationTest,SaveContentDigestV1Test,DraftSaveContractTest test`：20/20 通过（7+4+6+3），SQLite 3.49。新增 null 输入守卫后重跑 preparation 测试。
- `node --test scripts/draft-save-contract.test.mjs scripts/save-content-digest-v1.test.mjs`：11/11 通过。
- `node scripts/generate-draft-save-contract.mjs --check`、`npm run typecheck --workspace=@opm/web`、`git diff --check`：通过。
- 仅临时测试数据库；没有用户库迁移、线上模式切换、手动/自动保存、浏览器或强停恢复验证。独立备份可打开，不等同已执行替换源库的恢复操作。

完整文件清单（11 项；OpenAPI 生成后 bytes 保持，仍为三条原路径）：

1. `docs/contracts/schemas/opm-draft-save-v02.schema.json`
2. `apps/web/src/shared/api/generated/draftSaveContract.ts`（生成）
3. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java`（生成）
4. `scripts/draft-save-contract.test.mjs`
5. `services/local-runtime/src/main/java/org/opm/localruntime/storage/HybridSavePreparation.java`
6. `services/local-runtime/src/main/java/org/opm/localruntime/storage/PreparedDraftRepository.java`
7. `services/local-runtime/src/test/java/org/opm/localruntime/storage/HybridSavePreparationTest.java`
8. `specs/opm-hybrid-save-preparation-task-spec.md`
9. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
10. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
11. `docs/checklists/opm-hybrid-save-implementation-checklist.md`

## 已交付切片 HS-01A

Git 基线：2180f3823a547878f15c6dd2d2b11030718a0efa；工作目录已有前序修改，保留，直接当前目录开发。

本次精确范围：新增 `docs/contracts/schemas/opm-draft-save-v02.schema.json`、`scripts/generate-draft-save-contract.mjs`、`scripts/draft-save-contract.test.mjs`、`apps/web/src/shared/api/generated/draftSaveContract.ts`、`services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java`、对应 `DraftSaveContractTest.java`、`docs/contracts/migrations/sqlite/hybrid-save/V3__hybrid_save_foundation.sql`、`services/local-runtime/src/test/java/org/opm/localruntime/storage/HybridSaveFoundationMigrationTest.java`；更新本 Checklist、保存设计及实施规格。允许新增辅助说明 `docs/contracts/openapi/opm-draft-save-v02.json`。不接入默认迁移路径，不修改运行控制器、用户数据库或 V1/V2 migration。

Plan：先冻结保存与固定版本的 wire 字段、数据库边界；从 Schema 生成两端类型；用 AJV、Java 反序列化与真实 SQLite 验证；最后记录尚未交付的 HS-01 子项。生成器必须支持 --check，禁止只手改生成物。

- [x] 边界：HS-01A 只交付保存协议基础与待启用存储结构；不宣称完整 v2 编辑/查询、摘要、模型切换或前端保存已实现。
- [x] HS-01A-01：封闭 Schema、保存/固定版本 OpenAPI、Java/TS 类型一致；生成检查通过，三个 OpenAPI 操作通过解析验证，正确复用 `X-OPM-Session`。
- [x] HS-01A-02：负序号、不安全整数、未知字段、缺字段、非法 reason、nullable 规则正反例通过；Java 严格反序列化拒绝重复键、尾随输入和标量强制转换。
- [x] HS-01A-03：SQLite V1/V2→基础 V3、新库、重复迁移、原子回滚、旧写守卫、跨模型引用和不可变历史验证通过，包括 `INSERT OR REPLACE` 防绕过；确认 V3 不在默认 Runtime classpath。
- [x] HS-01A-04：生成检查、Java 定向测试、Web 类型检查、lint、diff 检查通过。

HS-I01/I02 尚不能整体完成：编辑/查询 v2 wire 已由 HS-01D 交付，在线模式切换及正式恢复流程未交付；摘要与 parity vectors 由 HS-01B 交付，临时库备份/迁移准备等价检查由 HS-01C 交付。HS-02A 存储事务、HS-02B~E 十三类命令/九条HTTP路径、HS-02F 保存事务/调度核心已交付；高级参数、保存公共入口/宿主注册/统一历史物化及 HS-03~04 尚未完成。

## 实际验证记录

2026-09-11，在当前目录执行：

- `node --test scripts/draft-save-contract.test.mjs`：4/4 通过。
- `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -pl services/local-runtime -Dtest=DraftSaveContractTest,HybridSaveFoundationMigrationTest test`：7/7 通过（协议 3 项，SQLite 4 项）。加入 REPLACE 防绕过后单独重跑 SQLite 4/4 通过。
- `node scripts/generate-draft-save-contract.mjs --check`：通过。
- `npm run typecheck --workspace=@opm/web`：通过。
- `npm run lint --workspace=@opm/web`：通过。
- `git diff --check`：通过。

SQLite 测试仅在临时数据库显式注册迁移；种子用于验证表约束，不构成真实模型内容等价迁移。未迁移用户数据库，未执行 Runtime 保存、浏览器保存、强停恢复或容量验证；这些能力尚未实现，不能以本轮测试代替。

## 完整文件清单

1. `docs/contracts/schemas/opm-draft-save-v02.schema.json`
2. `docs/contracts/openapi/opm-draft-save-v02.json`（生成）
3. `scripts/generate-draft-save-contract.mjs`
4. `scripts/draft-save-contract.test.mjs`
5. `apps/web/src/shared/api/generated/draftSaveContract.ts`（生成）
6. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java`（生成）
7. `services/local-runtime/src/test/java/org/opm/localruntime/api/generated/DraftSaveContractTest.java`
8. `docs/contracts/migrations/sqlite/hybrid-save/V3__hybrid_save_foundation.sql`
9. `services/local-runtime/src/test/java/org/opm/localruntime/storage/HybridSaveFoundationMigrationTest.java`
10. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
11. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
12. `docs/checklists/opm-hybrid-save-implementation-checklist.md`

## 已交付切片 HS-01B

规格：[保存内容摘要](../../specs/opm-hybrid-save-content-digest-task-spec.md)。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

Git 基线保持 `2180f3823a547878f15c6dd2d2b11030718a0efa`；在当前目录保留所有前序差异。Plan 及边界见规格第 3、5 节；不改 SQL、数据库、前端或 Runtime 保存入口。

- [x] HS-B01：生成 Schema/Java 资源一致，源 Schema 漂移守卫已固定。
- [x] HS-B02：两端使用同一 5 正向/20 负向向量，preimage、bytes、SHA 一致，未修改原 fixture。
- [x] HS-B03：元数据变化不影响内容去重；业务/布局/绑定/数组顺序/可选存在性变化可检测；输入不变。
- [x] HS-B04：非法输入正反例通过；Java raw 重复键、尾随输入、畸形 JSON 拒绝，负零词法不丢失。
- [x] HS-B05：原始 fixture 与丰富字段拆分还原通过；既有 Projection/JCS 回归通过。非数据库迁移证据。

2026-09-11 实际执行：

- `node --test scripts/save-content-digest-v1.test.mjs scripts/canvas06-projection-digest-v01.test.mjs scripts/canvas06-rfc8785.test.mjs`：11/11 通过，其中本切片 6 项，既有 owner 5 项。
- `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home ./mvnw -q -pl services/local-runtime -Dtest=SaveContentDigestV1Test,ProjectionDigestV01Test,Rfc8785JsonCanonicalizerTest test`：13/13 通过，其中本切片 6 项，既有 owner 7 项。
- 生成器增加冻结源 SHA 后重跑本切片与生成检查；结果见同名测试。向量作者不由测试执行。
- 本轮无 UI/HTTP handler/SQL 变更，不执行浏览器或数据库迁移验收。

完整文件清单（16 项）：

1. `scripts/generate-save-content-contract.mjs`
2. `scripts/save-content-digest-v1.mjs`
3. `scripts/save-content-digest-v1.test.mjs`
4. `docs/contracts/schemas/opm-save-content-v1.schema.json`（生成）
5. `services/local-runtime/src/main/resources/draftsave/save-content-v1.schema.json`（生成镜像）
6. `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java`
7. `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java`
8. `services/local-runtime/src/test/java/org/opm/localruntime/semantic/SaveContentDigestV1Test.java`
9. `tests/fixtures/hybrid-save/save-content-v1-vectors.json`
10. `scripts/author-save-content-vectors.mjs`
11. `scripts/canvas06-projection-digest-v01.mjs`
12. `services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ProjectionDigestV01.java`
13. `specs/opm-hybrid-save-content-digest-task-spec.md`
14. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
15. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
16. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
