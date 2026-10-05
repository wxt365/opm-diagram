# Checklist: P03 关系手势与统一候选交互实现

## Spec Mapping

- 规格：`specs/opm-p03-relation-gesture-and-candidate-interaction-implementation-task-spec.md`
- 验收：`REL-GESTURE-IMPL-01` 至 `REL-GESTURE-IMPL-08`
- 边界：OpenAPI/Runtime/Vue/X6/新关系手势 E2E 与既有 `workbench-layout.spec.ts` 主回归按精确 allowlist 实现；SQLite、Profile 资产、依赖和发布链保持禁止。

## Build

- [x] `REL-GESTURE-IMPL-01` Catalog 机器契约、生成 DTO 和 Runtime 已实现。
- [x] `REL-GESTURE-IMPL-02` 单一入口、目录动作和 Control selected Fact 路径已实现。
- [x] `REL-GESTURE-IMPL-03` 七阶段状态机与四类 X6 意图已实现。
- [x] `REL-GESTURE-IMPL-04` 26 个基础 Capability 的 Runtime 候选路径已实现；后继 direct-commit 语义由 `opm-p03-direct-relation-commit-interaction-task-spec.md` 接管。
- [x] `REL-GESTURE-IMPL-05` Control overlay/同 Fact 更新已实现。
- [x] `REL-GESTURE-IMPL-06` 零提交与失败保留边界已实现。

## Verify

- [x] `REL-GESTURE-IMPL-07` binary/fan/Self/State-specified/reload E2E 通过。
- [x] `REL-GESTURE-IMPL-08` contract、Java、Vue、typecheck、build、E2E 和 diff 检查通过。
- [x] 验证结果未提升 DEV-CANVAS-06、Candidate、Activation、production 或 ISO 状态。

## Verify Record

- `npm run contract:validate`：通过，OpenAPI、代表性 Schema 与生成 DTO 当前一致。
- JDK 21 `LocalApiServiceTest,LocalApiControllerTest`：`27/27` 通过。
- `npm test`：`13` 个测试文件、`76/76` 通过。
- `npm run lint`、`npm run typecheck --workspace=@opm/web`、`npm run build`：通过。
- Playwright `workbench-layout.spec.ts`：`11/11` 通过，覆盖 16 Procedural、8 Control、10 Structural、binary、fan、Self-invocation、State-specified 和 reload。
- Playwright `workbench-relation-gesture.spec.ts`：`1/1` 通过，覆盖空白释放、取消、确认前零提交、确认后单 Revision 与 reload。
- `git diff --check`：通过；工作区未生成 `vite.config.d.ts`。
- `local-runtime` 全量测试：`345` 项中 `4` 项失败、`1` 项错误。失败位于既有 `E2EFaultPlanVerifierTest` 和 `ProjectDatabaseFactoryTest`，对应 Fault Plan/JAR Schema 与数据库 `1.0/1.1`、Recovery marker 基线，不在本规格允许范围；P03 Java 定向测试通过。

当前结论：`IMPLEMENTED / VERIFIED_LOCAL_FEATURE_SCOPE`。本结果不构成 DEV-CANVAS-06、Candidate、Activation、production 或 ISO 符合性证据。
