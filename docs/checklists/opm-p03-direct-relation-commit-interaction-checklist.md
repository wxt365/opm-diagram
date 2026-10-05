# Checklist: P03 关系拖线直接创建交互

## Spec Mapping

- 规格：`specs/opm-p03-direct-relation-commit-interaction-task-spec.md`
- 验收：`REL-DIRECT-01` 至 `REL-DIRECT-06`
- 边界：只修改前端关系手势、参数门、对应设计与测试；Runtime 和公共契约不变。

## Build

- [x] `REL-DIRECT-01` 普通二元及默认完整 fan 松开即创建。
- [x] `REL-DIRECT-02` direct commit 仍执行 exact refresh、单 Revision 和重开。
- [x] `REL-DIRECT-03` 仅必填自由参数保留编辑器。
- [x] `REL-DIRECT-04` Shift 收集多端点 fan 后直接创建。
- [x] `REL-DIRECT-05` 取消和失败路径零提交。

## Verify

- [x] `REL-DIRECT-06` Web 单元、lint、typecheck、build 通过。
- [x] `REL-DIRECT-06` P03 Playwright 通过。
- [x] `REL-DIRECT-06` `git diff --check` 通过且未越界。

## Verify Record

- `2026-09-07`：实现前事实为全部 26 类基础关系即使 Runtime 只返回唯一 option 也停留在蓝色 candidate preview，并要求点击“确认创建”。
- `2026-09-07`：`npm run test --workspace=@opm/web` 通过，15 个测试文件、87 项测试全部通过。
- `2026-09-07`：`npm run lint --workspace=@opm/web`、`npm run typecheck --workspace=@opm/web`、`npm run build --workspace=@opm/web` 全部通过；Vite 构建保留既有 `/opm-bootstrap.js` 非 module 提示，不影响构建成功。
- `2026-09-07`：Java 21 Runtime 与独立 Vite 服务下执行 `npx playwright test tests/e2e/workbench-layout.spec.ts tests/e2e/workbench-relation-gesture.spec.ts --config=tests/e2e/playwright.config.ts`，13 项全部通过；覆盖松开直接创建、单 Revision、刷新重开、Shift fan、Alt 参数模式、切换关系工具后 committed 关系保持、16 类 Procedural、8 类 Control、10 类 Structural。
- `2026-09-07`：活动设计冲突扫描仅命中新规格的问题背景、回滚描述及冻结基线的取代记录；未发现仍生效的“唯一 option 必须二次确认”规则。
- `2026-09-07`：结论仅为 P03 本地功能范围 `IMPLEMENTED/VERIFIED_LOCAL_FEATURE_SCOPE`，不构成 DEV-CANVAS-06 controlled E2E、Candidate、Activation、生产发布或 ISO 符合性证据。
