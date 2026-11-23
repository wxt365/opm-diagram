# 撤销历史失败保护

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

## Spec

目标：语义编辑失败时保留未保存本地修改的撤销/重做记录；恢复候选读取失败时工具栏附近显示原因并可重试。
非目标：服务端恢复链、公共契约、其他编辑逻辑变更。
允许：apps/web/src/stores/workbenchRuntime.ts、WorkbenchSurface.vue、WorkbenchView.spec.ts、本规格及 checklist；按 AGENTS.md 第 7 条向既有 .harness/docs/agent-failures.md 追加漏验与 Eval。禁止：其他 .harness 内容、后端、依赖、schema、配置和无关文件。repo-profile/task-types/playbooks 缺失，遵循 AGENTS.md。不覆盖其他工作区改动。
契约影响：无。新增 store 的恢复查询错误/加载状态和重试方法仅供本工作台使用。

验收 F1：本地移动后语义命令被拒绝，本地 undo/redo 及布局 dirty 保持；成功提交后仍清理旧本地栈。F2：读取候选失败显示错误，允许重试，成功清除错误恢复按钮；读取失败不影响已有本地 undo/redo。F3：回归覆盖请求在途禁用、失败保留、成功清理和错误重试；前端完整回归、类型和定向 lint 通过。

Plan：将本地历史清理移动到服务端确认成功的位置（先于回读，避免服务端已成功但回读失败时保留过期历史）；公开已有 recoveryLoader 错误及加载状态，增加仅刷新候选的重试入口，沿用现有请求隔离；测试先复现后修正。

验证：Vue 组件/Store 集成用例及完整前端 Vitest、vue-tsc、定向 ESLint。不使用真实用户模型。回滚：仅撤销本次文件差异，旧会话与持久化结构不变。
