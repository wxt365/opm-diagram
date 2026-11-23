# 混合编辑后布局撤销恢复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary)。
仓库的 repo-profile、task-types 和 playbooks 当前缺失，遵循 AGENTS.md。

## Spec
目标：模型编辑成功且仍保留未保存布局时，恢复布局撤销和重做入口。
非目标：重设计全局历史顺序、保留跨语义编辑的每个布局步骤、修改后端恢复链。
允许：apps/web/src/stores/workbench/workbenchLayout.ts、相关现有测试、本规格。
禁止：其他目录实现、公共 API、schema、配置、依赖、真实模型数据和 .harness 写入。
契约影响：无公共契约变化；语义编辑成功后仍保留的布局合并为一条本地历史，以刷新后的投影为基线，避免恢复旧模型几何。
验收：A1 拖动后新增对象成功，布局仍可撤销/重做；A2 刷新后的服务端尺寸和无关节点不会被撤销覆盖；A3 提交失败保留原历史，保存后清理历史的既有行为保持。
验证：先运行新增定向测试确认失败，再运行修复后的工作台和布局测试、typecheck、lint、git diff --check。
回滚：仅还原本规格和本次代码、测试差异，不操作模型数据。

## Plan
1. 扩展现有混合编辑测试，补充布局投影重建测试。
2. 复用 pendingLayouts 在新投影覆盖后重建一条历史，仅在双栈为空时执行。
3. 运行定向和相关回归，记录实际结果。

## Checklist
Spec: specs/opm-mixed-layout-history-bugfix-task-spec.md
- [x] 边界确认：仅上述实现、测试和规格；禁止项已确认。
- [x] A1
- [x] A2
- [x] A3

## 验证结果
- 修复前新增投影回归和修改后的工作台回归均在预期撤销可用断言失败，确认问题；失败用例未卸载引起后续快捷键测试连带失败，修复并完成用例后全部消失。
- 修复后 WorkbenchView（126）、relationLayout（11）、operationHistory（2），合计 139 项通过。
- npm run typecheck --workspace apps/web、npm run lint --workspace apps/web、git diff --check 通过。
- Vitest 首次受沙箱 spawn EPERM 限制，授权后执行成功。
- 未运行真实浏览器 E2E 和后端测试：本次仅改变前端本地历史重建，无后端变更，未操作真实模型。
