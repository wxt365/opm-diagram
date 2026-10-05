# P03 状态影响关系箭头方向修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## 目标与非目标

输入输出状态指定影响关系应显示两段单向箭头：输入状态指向过程，过程指向输出状态。所有 Effect 共用的输入、输出线段遵循各自源到目标的方向；普通 Effect 若输入和输出为同一对象，叠合后仍表现为双向影响。

本次不修改 Fact、端点、OPL、保存内容、控制关系、工具栏符号或关系创建手势。

## 边界与契约

允许本规格、`docs/checklists/` 对应 Checklist、`apps/web/src/modules/workbench/opd/relations/procedural/procedural-render-helpers.ts` 和 `built-in-relation-registries.spec.ts`。禁止修改 API、Schema、数据库、配置、依赖、后端、用户模型和其他前端模块；保留工作树中已有修改。

现有 RelationRenderSpec 的 cell ID、source/target、zIndex、capture anchor、relation ID、preview/committed 通路保持不变，仅去除 Effect 两段线的源端箭头。X6 适配器按既有 `null` 语义清除旧 marker。

## 复现、验收与验证

复现：在输入输出状态指定影响关系的已提交画布中，两段线的两端均出现箭头。根因是 Effect 渲染函数给 input/output 两段同时设置 sourceMarker 和 targetMarker；原测试只覆盖线段数与层级，没有断言箭头方向。

- EFFECT-01：三端点状态关系保持一条 Fact、两段线；输入状态→过程、过程→输出状态各只有终点箭头。
- EFFECT-02：普通 Effect 与其他状态指定 Effect 复用同一方向规则；Fact、capture anchor、层级和普通非 Effect 关系不变。
- EFFECT-03：定向单测、类型检查、lint、构建、目标画布视觉核对与 `git diff --check`；无法执行项记录原因。

Plan：先加入失败的方向断言，再修改共用 Effect 线段 marker，最后按风险逐层验证。

回滚：撤销本任务的前端渲染与测试增量；已保存模型无需迁移或重建。
