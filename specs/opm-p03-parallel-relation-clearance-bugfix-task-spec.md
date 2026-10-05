# P03 并行二元关系节点避让修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## 目标与非目标

修复多个简单二元关系连接紧邻节点时，现有 24px 中点分轨仍落在节点宽度内，导致关系线、箭头和标签重叠的问题。自动分轨应根据两端节点尺寸把折点放在节点轮廓外；新建同类元素也应留出容纳关系标注的默认纵向空间，保持确定性和重开后一致。

不调整已有用户节点坐标、已保存 Fact/Revision、关系语义、显式 route、Effect 分段、fan 交点或后端。距离足够、无节点尺寸信息的原有分轨规则保持不变。

## 边界与契约

允许本规格及对应 Checklist、`parallel-relation-layout.ts` 和测试、`OpdCanvas.vue`、`workbenchRuntime.ts`、`tests/e2e/workbench-layout.spec.ts`。禁止修改公共 API、数据库 schema、配置、依赖、Symbol 资产和其他现有未提交修改。

并行关系只改变派生的 RenderSpec vertices；relation/occurrence/capture anchor、已保存布局和端点方向不变。新元素继续由现有 CREATE_ELEMENT 命令提交布局。

## 复现与验收

复现：独立 Runtime 工作台连续创建三个 Object，前两个相距 96px、节点高 72px；对前两个创建四条 Structural 二元关系。截图中箭头和标签挤在 24px 间隔内。

- CLEARANCE-01：紧邻节点间的两条及四条简单二元关系，折点稳定地分布在节点轮廓外，正反向及输入顺序不改变轨道身份。
- CLEARANCE-02：新建同类元素的默认间距不小于 176px；单条、显式 route、fan、Effect 分段和缺少端点尺寸时保持既有行为；节点移动后重新计算。
- CLEARANCE-03：独立 Runtime 工作台实际创建多条关系，检查画布 SVG path、保存重开后的路径与截图；定向/全量测试、typecheck、lint、build、`git diff --check` 通过。

Plan：先加入紧邻节点的失败断言，再传入节点尺寸计算外侧折点并调整新建元素间距，最后真实画布复测。

回滚：撤销本任务的前端排线和测试增量；无需迁移已保存模型。
