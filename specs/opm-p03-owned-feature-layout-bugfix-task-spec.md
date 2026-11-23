# 所属属性布局修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix。
Active Playbooks: none (primary)。本仓库 `.harness` 不存在，沿用现有 Vue/X6 测试与实现。

## 目标及边界

- LAYOUT-01：新增 Attribute/Operation 按所属节点右侧列及已有特征的实际底边追加，保留节点间距并避让已有非状态节点，不重排手动位置。
- LAYOUT-02：所属特征连接使用固定的右侧接点与垂直分支，数量增加不会转为上下扇出；保留 characterization/composition 的不同 OPM 符号。
- LAYOUT-03：当前草稿画布拖动对象/过程时，同步移动其 owned 属性/操作及各层状态；多选去重，单独拖动特征保持可用，状态容纳规则保持兼容。
- LAYOUT-04：通过已有“自动布局”修整历史散乱位置，预览、撤销与保存沿用现有流程。加载不自动重排历史布局。
- LAYOUT-05：更新平台实际使用的组件包并验证本地页面。
- 允许范围：`apps/web/src/stores/workbench` 的创建位置、移动、对齐、自动布局及相关测试；`apps/web/src/modules/workbench/opd/core` 所属连接与相关测试；`OpdCanvas.spec.ts`、`WorkbenchView.spec.ts`；本规格与 checklist；组件打包版本；平台 `apps/web-console/package.json`、vendor 组件及本地安装产物。
- 禁止范围：数据库、后端、生成契约、公共 API、新第三方依赖、助手、其他业务代码及已有无关变更。
- 非目标：任意图形的全局自动避线，不改变旧版非草稿单节点保存协议，不自动覆盖历史手工布局。
- 契约影响：仅前端几何计算，继续使用现有 UPDATE_LAYOUT_BATCH；不改变语义数据。
- 平台侧 Task Type: bugfix；Active Playbooks: frontend-vue (primary)、testing；仅交付本地组件包。平台规则已读。

## 实现计划

1. 先补实际底边追加、七个特征稳定连接、对象与特征状态一起移动的回归。
2. 修正位置、接点与所属移动索引；对齐使用相同的所属联动，自动布局保留现有预览入口。
3. 执行定向测试、类型/lint/构建与真实浏览器验证；打包接入平台。

## 验证与回滚

验收覆盖默认和变尺寸节点、障碍物、七个以上属性、拖动后继续添加、折叠属性随 owner 移动、多选去重、单独状态约束及自动布局幂等。
回滚只需回退本次前端计算和切回原组件包；无数据库迁移。
