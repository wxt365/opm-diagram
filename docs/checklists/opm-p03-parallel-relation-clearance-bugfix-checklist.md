# P03 并行二元关系节点避让 Checklist

规格：[并行二元关系节点避让修复](../../specs/opm-p03-parallel-relation-clearance-bugfix-task-spec.md)。

边界：只修改派生排线、画布调用及对应测试；不改 Fact、Revision、schema、API、依赖和用户节点布局。

- [x] CLEARANCE-01：紧邻节点的四条简单二元关系在轮廓外稳定分轨；排序和正反向单测通过，工作台 SVG 路径边界断言通过。
- [x] CLEARANCE-02：新建同类元素间距为 176px；单条、显式 route、fan、自调用保持原行为，拉开节点后恢复原分轨距离。
- [x] CLEARANCE-03：隔离 Runtime 工作台创建十类 Structural 关系，四条二元关系路径保存重开后一致；相关 Effect、16 类 Procedural 和 Structural fan 用例通过。前端单测 243/243、typecheck、lint、build、`git diff --check` 通过。

截图中交点关系仍可能靠近其他关系线；本任务的自动避让只覆盖简单二元关系。既有主路径 E2E 的“校验结果过期”断言与当前 Draft 模式校验行为不符，未计入本任务验证结果。
