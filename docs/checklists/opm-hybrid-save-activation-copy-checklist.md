# HS-04A 受控副本激活 Checklist

规格：[HS-04A](../../specs/opm-hybrid-save-activation-copy-task-spec.md)。

- [x] 边界确认：规格第1节，当前目录，16项精确范围；源/用户库/默认启动不变。
- [x] Plan：规格第4节，Schema→Repository→Service→真实副本验收。
- [x] HS-A01：新增两种封闭Schema和生成Java/TS；Node正反例、JavaReport严格解码通过，公共HTTP仍三条路径。
- [x] HS-A02：真实V1、V2旧库→PREPARED→V5激活副本；两Context摘要回读，源SHA、旧HEAD/两条历史、Snapshot/Baseline、原始JSON/负零保留，重复verify和activate通过。
- [x] HS-A03：错SHA/倒序时间/链接/输出嵌套/既有失败根、缺资产、不支持Context、缺迁移、报告漂移均拒绝；修改旧表并重算文件hash仍拒绝。
- [x] HS-A04：BEFORE_MODE/AFTER_MODE/BEFORE_COMMIT三处注入回滚，mode仍0、初始内容保留、准备根和源SHA不变；不通过测试手插mode证明成功。
- [x] HS-A05：完整激活输出复制到独立运行根，真实DraftWorkspaceService改名→MANUAL→Pin→双Context文本/投影和旧EXACT回读通过；MANUAL与PERMALINK用途隔离，同用途重复Pin复用；两条旧revision_document不变，新增两条savepoint。V1 LocalApiService.edit与底层旧HEAD写入均拒绝；当前通用PERSISTENCE_FAILED不是专用升级错误。
- [x] HS-A06：以下实际命令与结果，未执行项明确保留。

## 实际验证（2026-09-14）

Java使用 `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home`：

```sh
./mvnw -q -pl services/local-runtime -am test -Dtest=HybridSaveActivationTest,ActivatedDraftRepositoryTest,HybridSavePreparationTest,DraftSaveServiceTest,DraftSaveRepositoryTest,DraftPinRepositoryTest,DraftHistoryRepositoryTest,HybridSaveFoundationMigrationTest,DraftWorkspaceControllerTest,DraftSaveControllerTest -Dsurefire.failIfNoSpecifiedTests=false
```

10类83/83，零失败/错误/跳过：Activation7、Repository1、Preparation7、SaveService2、SaveRepository12、Pin7、History3、FoundationMigration4、DraftWorkspaceController26、DraftSaveController14。结果位于 `services/local-runtime/target/surefire-reports/TEST-org.opm.localruntime.*.xml`，以本次选定10类统计，不累加历史报告。

- `node --test scripts/draft-save-contract.test.mjs`：7/7。
- `node scripts/generate-draft-save-contract.mjs --check`、`node scripts/generate-draft-workspace-contract.mjs --check`：通过。
- `npm run typecheck --workspace=@opm/web`：通过；仅新增生成的独立接口，未更改前端行为，本轮不重复浏览器/前端全量测试。
- `git diff --check`、16项文件空白/换行与56条本地文档链接：通过；V1~V5五份SQL的raw SHA逐项复核，与冻结值一致。

首轮读回暴露旧Projection Digest不包含target_kind，按规格新增迁移独立摘要而未改发布owner；完整文档比较采用已有DraftJsonDelta数字口径，避免Jackson整数/浮点Node差异误拒绝。负零差异由独立正反例验证。Pin不同purpose的结果按既有HS-02I规则断言，不放宽Runtime去重。

未启动/停止用户服务，未改runtime-data，未创建worktree或commit。JUnit临时库仅用于测试，不能当生产Activation。在线安装、源停写锁、用户库迁移、升级提示、OS强停、压缩/Undo及容量待后继。

## 完整文件集合（16项）

1. `specs/opm-hybrid-save-activation-copy-task-spec.md`
2. `docs/checklists/opm-hybrid-save-activation-copy-checklist.md`
3. `specs/opm-hybrid-save-strategy-implementation-task-spec.md`
4. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
5. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
6. `docs/contracts/schemas/opm-draft-save-v02.schema.json`
7. `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java`
8. `apps/web/src/shared/api/generated/draftSaveContract.ts`
9. `docs/contracts/openapi/opm-draft-save-v02.json`（重新生成，内容不变）
10. `scripts/draft-save-contract.test.mjs`
11. `services/local-runtime/src/main/java/org/opm/localruntime/application/HybridSaveActivation.java`
12. `services/local-runtime/src/main/java/org/opm/localruntime/storage/ActivatedDraftRepository.java`
13. `services/local-runtime/src/main/java/org/opm/localruntime/storage/PreparedDraftRepository.java`
14. `services/local-runtime/src/test/java/org/opm/localruntime/storage/HybridSavePreparationTest.java`
15. `services/local-runtime/src/test/java/org/opm/localruntime/storage/ActivatedDraftRepositoryTest.java`
16. `services/local-runtime/src/test/java/org/opm/localruntime/application/HybridSaveActivationTest.java`
