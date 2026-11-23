# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L1; Task Type: bugfix; Active Playbooks: none (primary).

## Lean Spec

目标：修正对象/状态属性面板两项测试的过期标题断言，使其匹配已有“基本信息、颜色设置”。非目标：修改产品行为或处理其他测试。允许：apps/web/src/modules/workbench/WorkbenchView.spec.ts 中两项测试及本文档；禁止：产品实现、API、schema、配置、依赖、其他现有文件及 .harness。保留工作区统一撤销/重做的既有差异。无契约影响。

验收 C1：两项测试名称及标题预期符合实际面板，保留名称、备注、隐藏字段和两个颜色输入框的断言。C2：前端完整回归通过。

验证：核对 ElementAppearanceProperty 实现后修改两项测试；运行前端完整 Vitest 及该文件 ESLint。回滚：仅还原本次测试名称/标题预期和新增文档，不覆盖原有未提交改动。

## 实现顺序

更新名称和严格标题列表，保持其余断言；运行检查并记录结果。

## Checklist

引用：Plan#Lean Spec。

- [x] 边界确认：仅两项测试及本文档，无实现/契约变化；仓库 repo-profile/task-types/playbooks 文件缺失。
- [x] C1 — 两项名称及标题预期已更新，原字段/输入框数量断言保留。
- [x] C2 — 前端 78 个测试文件、683 项测试全部通过；该文件 ESLint 与 git diff --check 通过（仅既有 CRLF 提示）。日志 test-results/inspector-color-assertions-web.log。
