# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L1; Task Type: bugfix; Active Playbooks: none (primary).

## Lean Spec

目标：移除操作历史记录行的撤销/重做按钮，使用现有上方工具栏；保留历史记录、状态、刷新及查看版本。非目标：撤销链、服务端和快捷键逻辑变更。允许：WorkbenchBottomPanel.vue、WorkbenchBottomPanel.spec.ts、WorkbenchView.spec.ts 及本文档。禁止：API/schema、依赖、配置、其他实现和 .harness；保留现有未提交改动。无契约影响。repo-profile/task-types/playbooks 当前缺失。

验收 B1：历史项存在 UNDO/REDO 元数据时均不展示恢复按钮，记录/状态/刷新仍存在。B2：工具栏撤销/重做和快捷键回归通过。
验证：既有面板及工作台测试随入口调整，运行相关回归、类型及定向 ESLint。回滚：仅恢复本次按钮和测试差异。

## 实现顺序

删除按钮及面板未再使用的类型字段，面板测试验证无入口，工作台用例改为点击工具栏重做。

## Checklist

引用：Plan#Lean Spec。
- [x] 边界已确认，仅上述文件。
- [x] B1 — 移除历史恢复按钮与未使用的面板类型字段；UNDO/REDO 元数据下无按钮，刷新与记录状态验证通过。
- [x] B2 — 历史面板与工作台 129 项回归全部通过，含工具栏撤销重做、快捷键和本地分支守卫；TypeScript 与三个变更前端文件 ESLint 通过，git diff --check 通过（仅既有 CRLF 提示）。日志 test-results/history-remove-button.log。
