# 智能建模助手实现 Checklist

规格：[实现规格](../../specs/opm-conversational-modeling-implementation-task-spec.md)。

边界：已确认；保留上轮设计文档，仅实施规格授权目录。无 Java API 或数据库迁移；跨图写入、自动细化、批量事务、语义撤销和对话迁移不在第一版范围。测试只使用项目 `project.4d5d8be9f82546679b0efc92ea13648d` 中新建的隔离模型。

- [x] IM-01
- [x] IM-02
- [x] IM-03
- [x] IM-04
- [x] IM-05

## 验证记录

2026-10-04 至 2026-10-05，以下均为实际执行结果；未覆盖项单列。

| 验收 | 命令/场景 | 结果及证据边界 |
|---|---|---|
| IM-01、IM-02 | `OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=... npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant.spec.ts` | 最终用例通过（46.2 秒）。实际 `deepseek-flash` 经 Harness 七轮创建咖啡豆、待烘焙、已烘焙、烘焙过程、PROC-008 状态变化关系，再改名和移动。预览退出无写入；应用后画布出现状态及连线，OPL 为 `咖啡烘焙 changes 咖啡豆 from 待烘焙 to 已烘焙`；保存/刷新重开一致，历史版本输入及新建对话禁用。 |
| IM-03、IM-04 | 实际停止/重启助手服务后，`OPM_ASSISTANT_RESUME_PROOF=... npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-safety.spec.ts --output=/private/tmp/opm-assistant-safety-final` | 2 项通过（29.6 秒）。恢复 14 条消息和 7 个提案；同一 Harness session 续聊。重复应用、取消、无草稿 token、跨 scope 和手工冲突均无额外写入；父子图切换历史独立；父过程改名提案显示子图影响并阻断；停止后仍可在同一对话读取状态，模型未改变。 |
| IM-03、IM-04、IM-05 | `npm run assistant:test` | 12 项通过。HTTP 本地来源/令牌、非法状态/关系、取消/并发/重复应用、共享身份与同名独立身份、停止工具准入、串行持久写入、SDK create/resume 工具限制、三端候选查询、未完成结束原因均已检查。未知回执及丢失成功响应通过故障注入验证，不称为供应商真实断网验证。首次在受限沙箱执行 HTTP listen 被 EPERM 拒绝，允许本地监听后重跑全部通过。 |
| IM-05 | `npm run test --workspace=@opm/web`；最终定向运行 AssistantPanel/assistantPreview | 前端全量 43 文件、379 项通过；预览尺寸调整后定向 2 文件、5 项通过。覆盖面板恢复、切图丢弃迟到响应、中文输入法、状态容器扩容及父移动联动。 |
| IM-05 | `npm ci`、`npm run typecheck`、`npm run lint`、`npm run build` | 干净安装成功。类型、lint、生产构建及其草稿契约 freshness/OpenAPI/schema 检查通过；构建有既有 bootstrap 非 module 提示。锁文件已有依赖版本无升级，新增项为 Harness 及其依赖。 |
| IM-05 | Playwright 1600×1100 / 780×900、PNG 人工检查；`git diff --check`、本次相对链接和密钥扫描 | 桌面和窄屏助手面板在视口内，状态在对象内，连线与过程相连。密钥仅在 ignored 的 `.env.local`，权限 0600；可跟踪文件及前端 dist 未发现密钥。 |

收尾复现的模型为 `model.416fdb5045ff44fa91b686e6edfea7fe`；主用例截图和 `assistant-scope.json` 在 `test-results/workbench-assistant-真实-DeepSeek-多轮提案、画布预览、应用、保存重开与只读保护/`。安全测试在其上新增测试对象及子图，数据保留供复核；下一次安全整组回归须使用主用例新生成的模型。

收尾发现两端点查询会让模型遗漏三端状态变化候选，已补充工具规则并以真实七轮和三端参数测试复核。SDK `max-tokens/blocked/aborted/interrupted` 或缺失结束事件现显示失败，不冒充生成成功。

恢复/切换对话默认滚到最新提案，后续更新仍尊重用户向上阅读的位置。最终修改后重新执行 typecheck、lint、5 项定向前端测试和 build，均通过；只读浏览器复核最新提案定位及桌面/窄屏布局通过，截图在 `/private/tmp/opm-assistant-final-desktop.png` 和 `/private/tmp/opm-assistant-final-narrow.png`。最终 31 个变更文件的格式、文档链接及前端产物密钥检查通过。

未执行：供应商真实网络所有断线/回执故障、多用户/生产代理发布、跨图写入、自动细化、整组语义事务/撤销、会话迁移、完整 ISO 符合性。Java 源码未变，本轮不重跑全量 Maven；实际浏览器使用运行中的 Java Runtime 完成投影、EDIT、回执、保存和重开。问题列表复用刷新流程，本轮不把未运行的正式整模型校验声明为通过。

## 完整变更清单

以下包含本轮实现及同步保留的上一轮设计文档；不含 ignored 的本地密钥、运行数据和测试产物。

| 目录 | 文件 |
|---|---|
| 根目录 | `package.json`、`package-lock.json` |
| `apps/assistant/` | `.env.example`、`package.json`、`README.md` |
| `apps/assistant/src/` | `server.mjs`、`service.mjs`、`runtime.mjs`、`store.mjs`、`harness.mjs`、`harness-plugin.mjs`、`harness-sdk.mjs` |
| `apps/assistant/test/` | `service.test.mjs`、`http.test.mjs` |
| `apps/web/src/modules/workbench/` | `AssistantPanel.vue`、`AssistantPanel.spec.ts`、`assistantPreview.ts`、`assistantPreview.spec.ts`、`WorkbenchView.vue`、`WorkbenchBottomPanel.vue` |
| `apps/web/src/shared/` | `api/assistantApi.ts`、`types/modeling.ts` |
| `apps/web/` | `vite.config.ts` |
| `tests/e2e/` | `workbench-assistant.spec.ts`、`workbench-assistant-safety.spec.ts` |
| `specs/` | `opm-conversational-modeling-implementation-task-spec.md` |
| `docs/` | `README.md`、`design/opm-conversational-modeling-design.md`、`design/opm-modeling-workbench-page-design.md`、`checklists/opm-conversational-modeling-design-checklist.md`、`checklists/opm-conversational-modeling-implementation-checklist.md` |
