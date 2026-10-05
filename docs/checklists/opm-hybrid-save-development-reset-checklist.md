# HS-04B 验证记录

规格：`specs/opm-hybrid-save-development-reset-task-spec.md`。

- [x] 修改边界、用户清空授权、SQLite 与新旧工厂隔离已确认。
- [x] HS-R01
- [x] HS-R02
- [x] HS-R03
- [x] HS-R04
- [x] HS-R05

## 实际验证（2026-09-14）

Java 21：`mvn -q -pl services/local-runtime -Dtest=NewDraftModelTest,LocalApiServiceTest,ProjectDatabaseFactoryTest,DraftWorkspaceControllerTest,DraftSaveControllerTest,DraftSaveServiceTest,DraftSaveCoordinatorTest,HybridSavePreparationTest,HybridSaveActivationTest test`。最终9类97/97：首次旧工厂测试仍按历史V1断言且故障脚本与已存在V2冲突，修正为V2的1.1/22表和故障V3后，重跑该类5/5；其余92项已通过，无重复运行。日志 `/private/tmp/opm-hs04b-tests.log`、`/private/tmp/opm-hs04b-factory.log`，JUnit逐类最终报告在Runtime target/surefire-reports。

`mvn -q -pl services/local-runtime -DskipTests package` 通过，JAR SHA256=`00783d73c3b673a28fe2d3a5125748c2b9793e34e5343766db0c02f050d41844`；检查Jar包含冻结V1～V5，未修改SQL字节。

实际5173 Vite + 17850打包Runtime + Chromium：通过UI新建项目和模型，初始草稿seq=0；创建对象/过程后旧Revision仍为1；手动按钮保存和Ctrl+S再次保存共用1个savepoint；第3次编辑后等待十秒自动检查点，旧Revision仍为1、manual savepoint仍为1、checkpoint共3。刷新和Runtime正常终止重启后均恢复seq=3及3个图元，无pageerror；URL只含Context。SQLite integrity_check=ok、foreign_key_check为空。

执行：`node /private/tmp/opm-hs04b-browser-smoke.cjs` 和同命令加 `--reopen`。脚本/结果JSON/截图位于 `/private/tmp/opm-hs04b-browser-*`，仅为本地验收，不作为发布证据。未运行OS强停和容量测试；前端未改，不重复全量Web回归。应用内浏览器控制工具返回 `Codex auth token is unavailable`，无法替用户导航旧标签页；独立Chromium真实前端验收已完成。

旧开发4项目在停止旧Runtime PID55676后整体移至 `/private/tmp/opm-dev-data-reset-20260914-iC2htF/projects`，仍可恢复。恢复须停止Runtime，禁止覆盖后续新项目。本轮验收项目ID为 `project.650b244522754dae8fae4e5b291b24a6`，正常停止验收Runtime后移至同一临时根的 `verification-project`。

最终Runtime PID92558监听17850，前端保留5173。实际终验：health=UP，`/projects` HTTP200；直连/前端代理项目API均data=[]；bootstrap直连和代理逐byte一致、no-store、Profile0.2.0。`runtime-data/projects` 为空。`git diff --check` 通过。Node初次终验连接遭沙箱EPERM，提升到已授权的本机只读网络检查后全部通过，并非Runtime故障。用户可直接打开 `http://127.0.0.1:5173/projects`；原4项目URL不再有效。

## 本包完整文件集合（12项）

1. `specs/opm-hybrid-save-development-reset-task-spec.md`
2. `docs/checklists/opm-hybrid-save-development-reset-checklist.md`
3. `docs/checklists/opm-hybrid-save-implementation-checklist.md`
4. `docs/design/opm-hybrid-save-and-draft-recovery-design.md`
5. `services/local-runtime/pom.xml`
6. `services/local-runtime/src/main/java/org/opm/localruntime/storage/ProjectDatabaseFactory.java`
7. `services/local-runtime/src/main/java/org/opm/localruntime/storage/FlywayProjectSchemaMigrator.java`
8. `services/local-runtime/src/main/java/org/opm/localruntime/storage/StorageConfiguration.java`
9. `services/local-runtime/src/main/java/org/opm/localruntime/storage/NewDraftModelRepository.java`
10. `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`（仅本包新建/初始版本差异）
11. `services/local-runtime/src/test/java/org/opm/localruntime/application/NewDraftModelTest.java`
12. `services/local-runtime/src/test/java/org/opm/localruntime/storage/ProjectDatabaseFactoryTest.java`

其他前序差异原样保留，不创建worktree、不提交。
