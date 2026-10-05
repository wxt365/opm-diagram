# Checklist: P03 可折叠底部工作区

Spec：[任务规格](../../specs/opm-p03-collapsible-bottom-workspace-task-spec.md)。

- [x] 边界确认：仅现有前端与定向测试/文档；无 API、模型、URL 或依赖变更，直接当前目录开发。
- [x] SPACE-01：单元和真实 Chromium 验证只读标签位于 Header，原通知区隐藏；只读创建/拖放/改名/删除守卫回归通过。
- [x] SPACE-02：四个标签及箭头可收起/恢复，Enter 可操作，校验状态保留；新命令及切换 EXACT 不强制展开。capture 折叠输出为关闭。
- [x] SPACE-03：1440×1000 下实测画布增加 202px，底部高度由 240px 降至 38px；390×844 下无残留面板空白或页面横向溢出，恢复可用；无 UI 命令和 URL 变更。已查看展开与收起截图。
- [x] SPACE-04：以下为 2026-09-11 实际执行证据。

验证记录：

- Node `v22.22.0`；`npm run test --workspace=@opm/web`：15 个文件、114/114 通过。
- `npm run lint --workspace=@opm/web`、`npm run typecheck --workspace=@opm/web`、`npm run build --workspace=@opm/web`：通过。build 保留既有外置 bootstrap 脚本提示。
- `npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/workbench-layout.spec.ts tests/e2e/workbench-location.spec.ts tests/e2e/workbench-relation-gesture.spec.ts --output /private/tmp/opm-bottom-workspace-regression-results`：19/19 通过，覆盖布局、名称编辑、关系、HEAD/EXACT、只读与重开。
- 首轮发现空提示行的 Grid 分配导致画布不增高，以及版本切换重置底部状态，均在本包修复。扩大回归发现既有路径测试未等待 X6 挂载，补路径数量等待后保留原路径一致性断言，全量重跑通过。
- `git diff --check`：通过；临时服务使用 17851/5176 与独立测试数据库，用户运行数据未操作。

本轮修改：WorkbenchView、workbenchRuntime、base.css、WorkbenchView 单元测试、workbench-layout E2E、workbench-relation-gesture E2E 的就绪等待，以及本规格/Checklist、组件交互设计、状态模型、冻结基线。

边界：只覆盖本地画布交互；未更新发布/Golden/ISO 证据，无公共 API、Schema、SQLite、Profile 或依赖变更。
