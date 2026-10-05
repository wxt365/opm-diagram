# 当前子图行内返回父图

Work Mode: change；Risk Level: L1；Task Type: feature；Active Playbooks: frontend-vue (primary)。

## Plan

### Lean Spec

目标：返回父图以图标形式位于当前子图行尾（＋之后），仅当前且有父图的行显示按钮，根图不显示。删除导航底部独立返回按钮。固定行尾位置避免切图时＋和文字位置变化；只读历史仍可返回父图，加载/命令提交中禁用。
非目标：图层级、数据、API及树展开行为变更。
允许：WorkbenchView.vue、工作台导航CSS、既有定向组件/e2e测试、页面设计文档及本规格。禁止：后端、API/schema、依赖、配置、.harness和原案例数据。
验收：A1 当前子图行尾只有一个返回图标，根图无按钮；A2 返回正确父图并保持版本，图名和＋布局稳定；A3 长名称及390px窄屏无越界，真实画布导航及静态检查通过。
验证：既有WorkbenchView组件回归及navigator真实e2e；typecheck/lint/diff检查。回滚：还原本次行内按钮和样式增量。
实现：复用navigateContext和CornerUpLeft；每行预留固定返回槽，当前子图才渲染按钮，移除activeParentId及底部样式。

### Checklist

Spec: Plan#Lean Spec。允许/禁止目录与契约边界已确认，无API/schema/配置/依赖影响。
- [x] A1
- [x] A2
- [x] A3


## 实际验证

2026-10-02：WorkbenchView组件89项通过；既有导航真实浏览器2项通过。验证当前子图行内仅一个返回箭头、根图无按钮、切图前后＋横坐标一致、三级返回及历史只读导航。桌面1440×1000和窄屏390×844截图已人工查看，按钮/输入均未越界。隔离测试模型已移入回收站，原案例未修改。
`npm run typecheck`、`npm run lint`、`git diff --check`均通过。服务原已停止，已沿用原数据目录启动17850后端与5177前端。证据：`/private/tmp/opm-row-parent-e2e`、`/private/tmp/opm-row-parent-*.log`。
