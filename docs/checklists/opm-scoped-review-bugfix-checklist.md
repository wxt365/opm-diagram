# 子图审查范围与失败恢复检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[opm-scoped-review-bugfix-spec.md](../specs/opm-scoped-review-bugfix-spec.md)。

- [x] 允许/禁止目录与契约边界已确认，真实用户数据只读，实测隔离。
- [x] 已用真实日志复现，已阅读工具、审查、停止、转换、应用守卫和面板复用点。
- [x] REV-01：`review-scope.test.mjs` 验证子图、祖先、相关子图、共享身份裁剪及同名不同身份排除；`review.test.mjs` 验证历史提示和新冲突阻断；真实子图报告包含父图一致性范围。
- [x] REV-02：缺失 assumptions、额外字段、错图、未知短引用、重复身份及快照过期拒绝；历史两轮 29 份报告回放全部拒绝，错误包含具体字段或引用诊断。
- [x] REV-03：连续 3 次无效报告结束审查并保留 blocked 预览；迟到报告和预览写入拒绝；实际浏览器故障注入验证同一路径。
- [x] REV-04：生成、审查及修正超时分别测试；人工停止仍取消；重审保留命令身份，拒绝过期模型/脑图、错图、已取消与项目忙；脑图重审恢复原转换基线中的误删内容且保留用户排除；关闭失败不覆盖原超时原因。
- [x] REV-05：20 项助手面板组件测试通过，验证预览保留、禁确认、重审参数、只读/过期禁用及范围展示；实际浏览器验证截图已检查。
- [x] REV-06：助手全量 62 项测试通过，前端类型检查及 lint 通过，Git diff 检查通过；隔离 DeepSeek 与浏览器完整操作通过，生成和重审未提交前草稿 token 不变，确认只增加一次 edit_seq，保存与刷新恢复通过。

## 实际验证（2026-10-08）

- `/Users/xiaotaowang/.nvm/versions/node/v22.22.0/bin/node --test apps/assistant/test/*.test.mjs`：62/62，通过。本地 HTTP 监听在沙箱内受 EPERM 限制，沙箱外重跑通过；日志 `/private/tmp/opm-scoped-assistant-tests.log`。
- `npm run test --workspace=@opm/web -- src/modules/workbench/AssistantPanel.spec.ts`：20/20，通过；`npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web` 均退出 0。
- `OPM_E2E_EXTERNAL_SERVERS=true OPM_SCOPED_REVIEW_E2E=true node node_modules/@playwright/test/cli.js test tests/e2e/workbench-assistant-scoped-review.spec.ts --config=tests/e2e/playwright.config.ts --reporter=line`：1/1，通过，23.4 秒。使用 Runtime 17852、助手 17862、前端 5178 与独立临时存储；生成及故障触发 12.265 秒，重新审查 7.099 秒；5 步方案，平台阻断 0，报告无 ERROR，包含当前子图与 1 张父图的一致性检查。生成和重审使用真实 deepseek-flash；仅首次审查报告故意省略 assumptions，验证错误预算与恢复，不将故障注入报告冒称模型输出。
- 浏览器初稿测试曾因同名组件、SVG 定位及异步刷新等待条件失败，已按实际 DOM 和工作台新草稿状态修正。等待工作台重新读取后再保存，最终用例验证“已手动保存”和重开投影；另以实际 HTTP 确认保存与版本读取均 200、保存队列 NONE 且无错误。未为通过测试修改保存逻辑或降低校验。
- 浏览器证据位于 `test-results/workbench-assistant-scoped-review-真实子图生成、审查失败保留预览、重新审查及一次确认/`：`review-proof.json`、阻断与恢复预览截图。历史日志只读回放证据 `/private/tmp/opm-scoped-review-replay-evidence.json`（16 + 13 份无效报告均拒绝）。
- 正式助手在原持久化目录及端口 17860 重启，`/health` 为 UP；现有前端 5177、后端 17850 保持运行，后端健康为 UP。隔离测试服务随后停止，测试数据保留在临时目录。用户原会话仍为 stopped/cancelled，未改写历史记录；该次需重新发起需求，后续自动审查失败可直接重审。

一次真实样例验证交互与报告契约，不代表所有业务模型的语义正确性或完整 ISO 符合性认证。
