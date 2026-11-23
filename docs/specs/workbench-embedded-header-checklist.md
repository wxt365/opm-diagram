# 嵌入头部检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec：docs/specs/workbench-embedded-header-spec.md
边界已确认：仅组件头部/名称/参数/打包、相关验证和文档；后端/schema/依赖/.harness 禁止修改。

实现顺序：新增展示开关与静态项目名 → 原宿主显式保留 → 外部名称回读优先级 → 定向回归、构建与浏览器 → 安装包核对。
假设：第一张图自定义工具栏由外部项目移除；本仓库提供可替换它的组件头部。第二张图两块仅在嵌入默认隐藏。

- [x] H1：嵌入组件及真实 Chrome 画布验证外部项目/模型名称、保存状态与校验入口，默认隐藏 Profile/版本身份/版本选择器。
- [x] H2：原 WorkbenchView 99 项通过，包含 Profile 存在、版本区域及版本切换断言。
- [x] H3：动态外部名称、模拟内部回读、名称未传时内部回退测试通过。
- [x] H4：独立显示开关测试、JS SDK 浏览器切换与外部严格类型消费编译通过。
- [x] H5：106 项定向测试、lint/typecheck、应用与组件构建、Chrome 1 项浏览器验收通过；0.1.1 tgz 已生成并核对入口与新增参数声明。

验证命令与实际结果：
- `npm run test --workspace=@opm/web -- src/workbench/OpmWorkbench.spec.ts src/modules/workbench/WorkbenchView.spec.ts --silent`：2 个文件、106 项通过。
- `npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web`：通过。
- `npm run build --workspace=@opm/web`、`npm run build:workbench --workspace=@opm/web`：通过；原 bootstrap 外部脚本构建提示仍存在。
- `npx tsc -p apps/web/tsconfig.workbench-consumer.json`：通过。
- `npx playwright test --config=tests/e2e/playwright.workbench-component.config.ts`：Chrome 1 项通过。
- `npm pack ./apps/web/dist-workbench --ignore-scripts --offline --json`：生成根目录 `opm-workbench-0.1.1.tgz`，377630 字节，132 项；原 0.1.0 包保留。
- `git diff --check`：通过。后端、Profile、依赖锁文件与 .harness 无本次修改。
- 原服务端联调未执行：本次为前端展示参数调整，以原宿主回归和真实嵌入画布验证；不声明服务端联调通过。

## 本任务完整文件清单

修改：apps/web/src/workbench/OpmWorkbench.vue、WorkbenchInstance.vue、mount.ts、OpmWorkbench.spec.ts；apps/web/src/modules/workbench/WorkbenchSurface.vue、WorkbenchView.vue、WorkbenchView.spec.ts；apps/web/scripts/package-workbench.mjs；apps/web/examples/workbench.html、workbench-consumer.ts；tests/e2e/workbench-component.spec.ts；docs/integration/opm-workbench.md。
新增：docs/specs/workbench-embedded-header-spec.md、docs/specs/workbench-embedded-header-checklist.md。
生成：apps/web/dist-workbench（已忽略）、根目录 opm-workbench-0.1.1.tgz（已忽略）。
