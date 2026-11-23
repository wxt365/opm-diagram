# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/unified-model-history-feature-spec.md

- [x] 边界确认：按 Spec 允许目录与既有契约实现，无依赖/schema/配置变化。
- [x] H1 — DraftJournalRepositoryTest 12 项通过，包含三步撤销/重做、保存后重开、方向切换及新分支失效；HTTP 级联删除恢复与重做通过。
- [x] H2 — 原子事务、失败回滚、幂等重放、过期请求和历史过滤由仓储及 Controller 用例验证。
- [x] H3 — WorkbenchView 新用例验证工具栏/历史行/快捷键、分页候选及未打开历史面板的可用性。
- [x] H4 — 保存后本地栈清理；本地操作优先、历史重做守卫及新本地分支验证通过。手动保存失败前若布局已持久提交，历史接管该布局，不重复撤销。
- [x] H5 — UI/store 守卫覆盖只读、提交、保存、候选、预览和助手 busy；增加独立 commandInFlight 状态防止回读尚未完成提前启用。既有输入框快捷键隔离用例通过。
- [x] H6 — 实际结果及限制见下。

## 实际验证

- SQLite：DraftJournalRepositoryTest 12、DraftWorkspaceControllerTest 63、DraftSaveControllerTest 23，共 98 项通过。真实持久存储与 MockMvc HTTP；未使用真实用户模型做撤销。日志 test-results/unified-history-backend.log。
- 前端完整回归：681 通过、2 项既有失败，均为 State/Object inspector 的旧断言只接受“基本信息”，实际早已包含“颜色设置”；与本次撤销逻辑无关，保留原断言未越界修改。日志 test-results/unified-history-web-all.log。
- 定向工作台四项通过；历史面板、画布菜单、草稿会话与历史加载四文件共 63 项通过。日志 test-results/unified-history-focused.log 与 unified-history-components.log。
- 助手完整 125 项通过。生成契约 --check、web TypeScript 检查、8 个变更前端文件定向 ESLint、生产构建和 git diff --check 通过。构建保留既有大 chunk 提示，diff 仅 CRLF 提示。
- Maven wrapper 缺少 properties，使用机器已有 IntelliJ Maven/Java 17 与既有 .codex/runtime-maven-settings.xml 离线运行，无配置文件变更。
- 未执行 PostgreSQL、真实浏览器点击或部署重启；本轮使用 SQLite、MockMvc 和 Vue 组件/键盘事件验证。上线需部署匹配前后端、重启后端并刷新页面。

## 手工验收

1. 在活动草稿拖动两次，工具栏撤销/重做逐次恢复；输入框内 Ctrl+Z 仍只撤销文字。
2. 保存后工具栏提示服务端操作名称，撤销一次恢复该次保存的布局；新界面历史行显示对应重做入口。
3. 创建/删除对象并连续撤销、重做，观察图元、关系、导航与历史同步；刷新或重启后仍可继续。
4. 撤销后做新编辑，旧重做不再可用；只读版本、提交/保存、布局预览、助手生成或应用期间按钮禁用。
5. 网络/版本冲突时观察错误提示；冲突按既有工作台流程重新载入，不能绕过 token 检查。

## 完整文件清单

- apps/web/src/modules/workbench/CanvasContextMenu.vue
- apps/web/src/modules/workbench/WorkbenchBottomPanel.vue
- apps/web/src/modules/workbench/WorkbenchBottomPanel.spec.ts
- apps/web/src/modules/workbench/WorkbenchSurface.vue
- apps/web/src/modules/workbench/WorkbenchView.spec.ts
- apps/web/src/modules/workbench/useWorkbenchNavigation.ts
- apps/web/src/stores/workbench/workbenchLayout.ts
- apps/web/src/stores/workbenchRuntime.ts
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftOperationRecovery.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/OperationHistoryRepository.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJournalRepositoryTest.java
- specs/unified-model-history-feature-spec.md
- specs/unified-model-history-feature-checklist.md
