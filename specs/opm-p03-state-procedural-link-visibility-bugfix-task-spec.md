# P03 状态过程关系线可见性修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：none (primary)。仓库当前没有 `.harness/`，本任务不创建该目录。

## 目标与非目标

已提交的状态指定消耗、状态指定生成和输入输出状态指定影响关系，应清楚连接状态框与过程框。修复状态与其所属对象外框之间的线段被遮挡的问题。不改变消耗、生成、影响的语义，不自动转换用户已建的关系。

## 边界与契约

允许修改 `apps/web/src/modules/workbench/opd/core/`、`apps/web/src/modules/workbench/opd/relations/` 内的渲染实现和定向测试、`tests/e2e/workbench-layout.spec.ts` 中的定向场景，以及本规格与 `docs/checklists/` 中的对应 Checklist。禁止修改其他工作区脏文件、公共 API、数据库 schema、配置、依赖、后端、用户数据和 `.harness/`。允许新增或修改定向测试；不改文档中既有模型语义。

内部 RelationRenderSpec 可承载关系线的显示层级；Fact 端点、关系 ID、OPL/Trace、持久化格式和命令行为不变。状态关系线须位于对象框之上、状态框之下；普通对象过程关系保持原层级。

## 验收与验证

- SV-01：状态指定消耗与生成的已提交连线在所属对象框内可见，端点仍是各自状态；普通关系显示层级不变。
- SV-02：输入输出状态指定影响的两段连线均可见；增量更新后层级保持正确。
- SV-03：定向前端测试、类型检查、lint 和实际画布视觉核对通过；无法执行项说明原因。

Plan：先将状态过程连线的层级写入内部渲染规格，再让 X6 新建与增量更新使用该层级，最后按二端点和三端点关系验证。

回滚：撤销本任务对前端渲染和测试的增量修改；已有 Fact 与模型数据不需要迁移。
