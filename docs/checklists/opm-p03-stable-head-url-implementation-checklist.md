# P03 稳定 HEAD URL 实现检查

规格：[实现规格](../../specs/opm-p03-stable-head-url-implementation-task-spec.md)。

- [x] 边界确认：L3；frontend-vue/testing；仅规格列出的前后端、OpenAPI、测试、文档；不改 SQLite/依赖/发布/既有画布功能。
- [x] URL-I01：WorkbenchView 组件及 workbench-location 浏览器回归通过。
- [x] URL-I02：当前 Head 的精确链接、历史链接、返回 Head、前进后退、过期加载/提交响应通过；只读拖动禁止，选择和平移可用。
- [x] URL-I03：Runtime 归属校验、Context 回退、非法输入、空 Revision、错误入口不规范化、投影身份缺失/不匹配关闭入口通过。
- [x] URL-I04：隔离 SQLite 的无 Head/最近及旧 Baseline/无可用版本/无 Head 精确版本读取通过。
- [x] URL-I05：永久链接、版本选择、返回草稿及原画布回归通过；390×844 截图人工检查无页面横向溢出。
- [x] URL-I06：以下实际验证通过；发布边界未提升。

## 验证记录（2026-09-11）

| 命令 | 实际结果 |
| --- | --- |
| `npm run test --workspace=@opm/web` | 15 文件、113/113；含 WorkbenchView 52、OpdCanvas 10、localRuntimeApi 8 |
| Java 21 下 `./mvnw -o -pl services/local-runtime -am package -Dtest=LocalApiServiceTest,LocalApiControllerTest -Dsurefire.failIfNoSpecifiedTests=false` | 31/31；JAR 构建成功 |
| `./node_modules/.bin/playwright test tests/e2e/workbench-location.spec.ts tests/e2e/workbench-layout.spec.ts tests/e2e/workbench-relation-gesture.spec.ts tests/e2e/workbench-construct-lifecycle.spec.ts tests/e2e/opm-bootstrap-order.spec.ts --config=tests/e2e/playwright.config.ts` | 20/20；独立 Vite 5176 / Runtime 17851 |
| `npm run lint --workspace=@opm/web` | 通过 |
| `npm run build --workspace=@opm/web` | vue-tsc 类型检查与 Vite 构建通过；既有 `/opm-bootstrap.js` 非 module 警告仍存在 |
| `node scripts/validate-contracts.mjs` | OpenAPI、代表性 Schema、API-EDT 校验通过 |
| `git diff --check` | 通过 |

首次 Maven 使用环境默认 Java 17 被 enforcer 拒绝，后续显式使用本机 Java 21；首次 Playwright 受沙箱本机连接 EPERM 阻断，经执行权限审核后完成真实浏览器回归。均未把受阻运行计作通过。

本地开发 Runtime 已在相同仓库目录、相同 runtime-data 下重启（17850）；只读 smoke：health=UP，Web 5173=200，同一 Revision 的 HEAD=EDITABLE_DRAFT、EXACT=READONLY_SNAPSHOT。不执行用户模型编辑命令，不改变数据库 schema。

## 完整变更文件

- `specs/opm-p03-stable-head-url-implementation-task-spec.md`
- `docs/checklists/opm-p03-stable-head-url-implementation-checklist.md`
- `apps/web/src/app/workbenchLocation.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/stores/projectModel.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/shared/api/localRuntimeApi.spec.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalApiController.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `tests/e2e/workbench-location.spec.ts`

上述已存在的 dirty 文件只叠加本轮必要变更，保留此前画布交互、符号及关系标签编辑改动。

## 未提升的边界及后续兼容项

- 现有 Runtime 未提供 Named Snapshot 管理及“基于固定版本创建草稿”接口，本轮未伪造按钮或写 API；固定 Revision 可统一通过 EXACT 打开，已有 Baseline 从版本列表打开。
- `scripts/canvas06-common-browser-capture.mjs:119` 与 `scripts/canvas06-golden-family-capture-adapter.mjs:81` 仍构造 EXACT 页面入口。前者还执行 `SUBMIT_ONE_SHOT_FAULT_COMMAND`，在新只读策略下不能继续编辑；后继发布适配需按新契约选择 HEAD 并校验实际 Revision，不能通过放宽 EXACT 只读绕过。
- 本轮未修改上述冻结发布脚本，未执行受控 release suites、production 194/388、Candidate 或 Activation；20 项普通 E2E 不构成发布或 ISO 符合性证明。
