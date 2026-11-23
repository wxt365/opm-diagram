# 清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/refined-parent-rename-spec.md

边界确认：父名称的有限放行+影响范围预览审查；不修改其他语义或权限。

- [x] NAME-01：真实MVC验证创建子图后能力enabled，追加UPDATE_PROPERTY可预览提交。
- [x] NAME-02：已保存父过程改名返回既有子图与同版本OPL，共享出现/端点/所属状态特征影响图纳入。
- [x] NAME-03：助手63/63、草稿56/56通过；缺图审查拒绝确认，身份/事实/子图名称保持，重试不重复。
- [x] NAME-04：仅直接细化父元素的UPDATE_PROPERTY有限放行；其他目标/命令沿用guard保护，原跨图失败回归通过。

真实验收：使用此前独立测试项目project.0671551c82054f429980c2ece8e1ce6a/model.ed89d9c8650f48a18b89701aba1b8007，真实模型追加1步UPDATE_PROPERTY，父及已有子图标准审查通过ready，一次确认edit_seq 1→2，target_id/occurrence_id保持。未操作业务项目。验收报告位于系统临时目录opm-refined-parent-rename-acceptance.json。

服务已重启；git diff --check通过。修改完整清单：DraftModelPlan.java（guard传命令类型）、DraftWorkspaceService.java（父名称放行及影响图预览）、DraftWorkspaceControllerTest.java；apps/assistant/src/proposal-application.mjs（多图审查覆盖保护）、apps/assistant/test/service.test.mjs；本规格清单。无依赖/契约/schema迁移。
