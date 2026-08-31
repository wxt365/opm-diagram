# Spec: DEV-CANVAS-06 Common Setup Plan 实现

文档状态：`READY_FOR_BUILD`

实现状态：`NOT_STARTED`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `backend-springboot`
- `frontend-vue`
- `testing`

超过3个 playbook 的原因：同一不可执行序列同时涉及设计冻结、Projection wire、Runtime 查询、Vue 可达入口和跨层回归，拆开会留下不可消费的中间契约。

## 1. Spec Mapping

| 项目 | 冻结内容 |
| --- | --- |
| 目标 | 为16项 Common initial state 生成、验证、复制、引用与执行唯一 SETUP 输入 |
| 范围 | Plan Schema、Common input builder/verifier、Manifest 0.2 raw ref closure、Runner Plan validation/execution、定向测试 |
| 非目标 | 公共 HTTP wire、SQLite DDL、产品默认配置、历史 `0.1.0` 输入根、Gate/Candidate/Activation/Capability |
| 约束 | Node 22、JCS、44-file exact root、动态 option 仅来自同 revision 的 API-EDT-001、零 fallback、attempt 前失败零输出 |
| 验收 | 第5节命令通过；错误 Plan/Join/selector/option/模板被拒绝；成功路径只产生真实 API evidence |
| 回滚 | 删除本任务新增 Plan/Schema/接入，不删除历史或 installed release root |

## 2. 精确修改边界

允许修改：

1. `docs/contracts/schemas/opm-dev-canvas-06-e2e-common-setup-plan.schema.json`
2. `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json`
3. `docs/contracts/openapi/opm-local-api-v1.yaml`
4. `docs/design/opm-dev-canvas-06-e2e-common-setup-plan-design.md`
5. `docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md`
6. `specs/opm-dev-canvas-06-e2e-common-setup-plan-implementation-task-spec.md`
7. `specs/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md`
8. `scripts/canvas06-e2e-common-setup-plan.mjs`
9. `scripts/canvas06-e2e-common-setup-plan.test.mjs`
10. `scripts/build-canvas06-common-visual-fixtures.mjs`
11. `scripts/verify-canvas06-common-visual-fixtures.mjs`
12. `scripts/common-visual-fixtures.test.mjs`
13. `scripts/canvas06-e2e-common-fixtures.mjs`
14. `scripts/canvas06-e2e-common-fixtures.test.mjs`
15. `scripts/canvas06-e2e-manifest-v02-compose.mjs`
16. `scripts/canvas06-e2e-manifest-v02-invariants.test.mjs`
17. `scripts/release-canvas06-e2e-manifest-v02.mjs`
18. `scripts/release-canvas06-e2e-manifest-v02.test.mjs`
19. `scripts/verify-canvas06-e2e-manifest-v02.mjs`
20. `scripts/verify-canvas06-e2e-manifest-v02.test.mjs`
21. `scripts/release-canvas06-e2e-run.mjs`
22. `scripts/release-canvas06-e2e-run.test.mjs`
23. `scripts/validate-canvas06-visual-e2e-schemas.test.mjs`
24. `scripts/validate-contracts.mjs`
25. `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
26. `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
27. `apps/web/src/shared/api/localRuntimeApi.ts`
28. `apps/web/src/stores/workbenchRuntime.ts`
29. `apps/web/src/modules/workbench/WorkbenchView.vue`
30. `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
31. `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs`
32. `tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs`

OpenAPI 只允许给 `CreateStatePayload` 增加可选 `state_id`、给完整 `CreateFactPayload` 增加可选 `fact_id`，并给 `ContextProjectionResult.data` 增加只读 `suppressed_states`。禁止其他 OpenAPI、DTO、路径、状态码或 wire 变化。

禁止修改：`.harness/**`、SQLite DDL、生产配置、历史 Common `0.1.0` 输入、已安装 release root，以及本清单外所有产品模块。

## 3. 实现顺序

1. Schema、Plan builder/verifier 与正反例；
2. Plan 加入 Common 44-file root，builder 先内检、后原子 rename；
3. Manifest Schema、compose/producer/verifier/exact tree；
4. Runner 在 fresh attempt 前验证 Plan，并按 Plan 执行正式 same-origin API SETUP；
5. 若无法闭合，不得以临时 payload、fallback 或 placeholder 继续。

## 4. Checklist

- [ ] Plan Schema、16项固定顺序、payload digest 与 raw-ref kind 通过正反例。
- [ ] Plan 语义矩阵覆盖 M0 外八类状态及动态 option 唯一性。
- [ ] Common builder/verifier 完成 44-file tree 与 Plan/Catalog/driver/binding closure。
- [ ] Manifest producer/verifier 完成 `common_setup_plan_ref` copy、exact tree 与 installed ref 验证。
- [ ] Runner 在输出前拒绝缺失或漂移 Plan，并以真实 API evidence 执行 SETUP。
- [ ] Node 22 定向测试、`npm run contract:validate`、`git diff --check` 通过。

## 5. 必跑命令

```text
/Users/xiaotaowang/.nvm/versions/node/v22.22.0/bin/node --test scripts/canvas06-e2e-common-setup-plan.test.mjs scripts/canvas06-e2e-common-fixtures.test.mjs scripts/release-canvas06-e2e-run.test.mjs
/Users/xiaotaowang/.nvm/versions/node/v22.22.0/bin/node --test scripts/validate-canvas06-visual-e2e-schemas.test.mjs scripts/canvas06-e2e-manifest-v02-invariants.test.mjs scripts/release-canvas06-e2e-manifest-v02.test.mjs scripts/verify-canvas06-e2e-manifest-v02.test.mjs
/usr/bin/env PATH=/Users/xiaotaowang/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/usr/bin:/bin npm run contract:validate
git diff --check
```

成功仅表示本切片实现完成，不代表真实 `194/388`、Report、Gate、Candidate、Activation、Capability、生产或 ISO 结论。
