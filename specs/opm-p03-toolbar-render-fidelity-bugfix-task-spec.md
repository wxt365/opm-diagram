# P03 关系工具图标与画布渲染一致性修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## 目标与非目标

修正已复现的关系工具图标与已提交画布渲染不一致：PROC-003/008/009/010 应显示经过程的两段单向 Effect 关系；STRUCT-001~004/010 的箭头应与 Symbol Catalog 的开放箭头或半箭头一致；STRUCT-008 应显示分类圆点；STRUCT-009 应显示展示三角交点。

不修改关系语义、Fact、端点、OPL、后端或已保存用户模型；不改变其余图标和关系类型。

## 边界与契约

允许本规格及对应 Checklist、`apps/web/src/modules/workbench/RelationToolSymbol.vue`、`apps/web/src/modules/workbench/opd/core/relation-tool-symbol.ts`、`apps/web/src/modules/workbench/opd/core/relation-render-spec.ts`、`apps/web/src/modules/workbench/opd/relations/structural/` 下相关定义和渲染 helper，以及上述区域的定向测试和 `tests/e2e/workbench-layout.spec.ts`。禁止修改公共 API、数据库 schema、配置、依赖、后端、符号目录资产和任务外文件。现有未提交修改全部保留。

内部 RelationRenderSpec 允许增加 ellipse 交点装饰节点；其身份、Fact、capture anchor、OPL 和持久化格式不变。STRUCT-009 从普通边切换为单成员交点表示，已存在 Fact 重新投影时应得到同样形态。

## 复现、验收与验证

复现：隔离 X6 画布逐项渲染 34 种关系能力，九项与工具图标不符；现有组件测试仅覆盖图标存在和少量端点几何，既有端到端测试创建全部关系但未比较图标与实际 marker/交点。

- FIDELITY-01：PROC-003/008/009/010 图标各显示输入、过程、输出三个节点及两段单向箭头，并区别状态端与对象端。
- FIDELITY-02：STRUCT-001/002/010 在画布上使用开放箭头；STRUCT-003/004 使用相反侧半箭头；预览和已提交关系一致。
- FIDELITY-03：STRUCT-008 的交点为开放三角形内黑圆点；STRUCT-009 的交点为开放三角形内黑三角，重开后保持。
- FIDELITY-04：在独立本地项目通过工作台实际创建受影响关系，检查 SVG 形态、保存与重开；定向测试、前端完整测试、typecheck、lint、build 与 `git diff --check` 通过。

Plan：先加入定向失败断言；再修正图标映射和结构渲染；最后在隔离 Runtime 的真实工作台创建、保存、重开并核对桌面及窄屏。

回滚：撤销本任务前端图标、渲染和测试增量；Fact 与数据库无需迁移。
