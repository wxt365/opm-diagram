# 工作台组件实施清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：docs/specs/workbench-component-spec.md

边界确认：仅前端组件/状态/适配层/构建、相关测试与接入文档；后端/API/schema/profiles/.harness 不变；不新增依赖。

实现顺序：提取实例状态工厂及服务注入 → 抽取无路由工作台与原页面宿主 → 快照/默认上下文/生命周期 → 库构建与示例 → 定向及完整验证。
取舍：保留原源码模块位置，提供独立库入口和构建产物，避免无关路径迁移；展示快照只读，编辑复用现有完整语义服务，不在前端伪造语义规则。

- [x] AC1 原宿主回归：原 WorkbenchView 99 项测试通过；完整前端 52 个文件、446 项测试通过；原前端应用构建通过。
- [x] AC2 无宿主默认挂载：默认空白工作台、无 Router/Pinia 插件和会话、无网络请求测试通过。
- [x] AC3 快照传入、导航和替换：上下文、OPD/OPL、跨图问题定位、输入不被修改、旧服务响应不覆盖新快照测试通过。
- [x] AC4 多实例与功能开关：实例选择/OPD/DOM 标识/卸载隔离、删除快捷键范围、默认隐藏头部与服务功能测试通过。
- [x] AC5 独立构建、类型与接入示例：ESM/CSS/包清单/声明生成通过；独立消费者严格 TypeScript 编译通过；Chrome 真实 X6 构建产物集成测试 1 项通过。

验证记录：
- `npm run test --workspace=@opm/web -- --silent`：52 个文件、446 项通过。
- `npm run lint --workspace=@opm/web` 与 `npm run typecheck --workspace=@opm/web`：通过。
- `npm run build --workspace=@opm/web`：通过；现有 bootstrap 外部脚本提示仍存在。
- `npm run build:workbench --workspace=@opm/web`：通过，产物 `apps/web/dist-workbench`。
- `npx tsc -p apps/web/tsconfig.workbench-consumer.json`：通过，不使用源码别名、不跳过声明检查。
- `npx playwright test --config=tests/e2e/playwright.workbench-component.config.ts`：Chrome 中 1 项通过，真实画布、多实例、样式、无 API、数据替换及销毁均验证。
- `node scripts/validate-contracts.mjs`：通过。
- `git diff --check`：通过。
- 根目录 `npm run build`：失败于前置 `contract:check` 的既有 `apiEdtContract.ts` 字节一致性检查；此文件本次无 diff，`git ls-files --eol` 显示 i/lf、w/crlf；未越界重生成契约文件。前端独立构建成功。
- 原服务端联调 E2E 未执行：默认服务启动脚本使用 macOS `/private/tmp` 和 Java 21 路径，当前为 Windows、默认 Java 17；原页面功能以现有 99 项工作台测试和前端完整回归核对，不声称服务端联调通过。

## 完整文件清单

新增：
- apps/web/.gitignore
- apps/web/examples/workbench-consumer.ts
- apps/web/examples/workbench.html
- apps/web/scripts/package-workbench.mjs
- apps/web/scripts/serve-workbench-example.mjs
- apps/web/src/modules/workbench/WorkbenchSurface.vue
- apps/web/src/workbench/OpmWorkbench.spec.ts
- apps/web/src/workbench/OpmWorkbench.vue
- apps/web/src/workbench/WorkbenchInstance.vue
- apps/web/src/workbench/contracts.ts
- apps/web/src/workbench/host.ts
- apps/web/src/workbench/index.ts
- apps/web/src/workbench/internal.ts
- apps/web/src/workbench/localRuntimeServices.ts
- apps/web/src/workbench/mount.ts
- apps/web/src/workbench/services.ts
- apps/web/src/workbench/styles.css
- apps/web/tsconfig.workbench-consumer.json
- apps/web/tsconfig.workbench.json
- apps/web/vite.workbench.config.ts
- docs/integration/opm-workbench.md
- docs/specs/workbench-component-checklist.md
- docs/specs/workbench-component-spec.md
- tests/e2e/playwright.workbench-component.config.ts
- tests/e2e/workbench-component.spec.ts

修改：
- apps/web/package.json
- apps/web/src/modules/workbench/AssistantPanel.vue
- apps/web/src/modules/workbench/OpdCanvas.spec.ts
- apps/web/src/modules/workbench/OpdCanvas.vue
- apps/web/src/modules/workbench/WorkbenchBottomPanel.vue
- apps/web/src/modules/workbench/WorkbenchView.vue
- apps/web/src/modules/workbench/useMindmap.ts
- apps/web/src/modules/workbench/useOpdRefinement.ts
- apps/web/src/modules/workbench/useWorkbenchNavigation.ts
- apps/web/src/stores/workbench/findingsWorkflow.ts
- apps/web/src/stores/workbenchRuntime.ts
- tests/e2e/playwright.config.ts

生成产物已忽略：apps/web/dist-workbench。后端、数据库、Profile 资产、依赖锁文件和 .harness 均未修改。
