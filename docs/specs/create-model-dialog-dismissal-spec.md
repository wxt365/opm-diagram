# 创建模型弹框防误关

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: frontend-vue（primary）。

## Lean Spec

目标 D1：点击创建模型弹框外或按 Esc 不关闭且输入保留。D2：点击 X、取消正常关闭并恢复触发按钮焦点；创建成功仍按原流程关闭和跳转。
原因：创建框遮罩绑定 click.self 关闭，共享焦点工具的 Escape 也直接关闭。原组件测试明确接受 Escape 关闭，未覆盖输入后点击遮罩的误关场景。
允许修改 ProjectDetailView.vue、对应测试及本规格；禁止修改共享弹框工具、其他弹框、API、schema、配置和依赖。
计划：先更新既有回归使误关失败，再仅移除本弹框的遮罩关闭和 Esc 关闭入口，保留焦点恢复；验证组件和隔离项目浏览器。
回滚：仅恢复本创建弹框两处事件绑定及对应测试，保留其他修改。

## Checklist

- [x] Lean Spec 允许与禁止边界确认。
- [x] D1–D2：新增回归先在遮罩点击后失败；修复后项目详情 15 项测试通过，定向 ESLint、`git diff --check` 通过。浏览器在隔离项目输入名称与目标，点击遮罩及按 Esc 保留弹框和输入，取消及 X 关闭并恢复焦点；未提交模型。截图 `/private/tmp/create-model-dialog-protected.jpg`。
