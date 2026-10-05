# P03 关系工具图标与画布渲染一致性 Checklist

规格：[关系工具图标与画布渲染一致性修复](../../specs/opm-p03-toolbar-render-fidelity-bugfix-task-spec.md)。

边界：仅前端关系图标和结构渲染、定向测试、工作台 E2E 及本任务文档；不改公共 API、schema、配置、依赖、后端、符号目录资产和已有用户数据。

- [x] FIDELITY-01：普通及状态影响图标三端点、两段单向线；组件测试通过。
- [x] FIDELITY-02：结构关系开放箭头、半箭头及预览/提交一致；Registry、预览和画布测试通过。
- [x] FIDELITY-03：分类和状态特征关系三角交点；真实画布创建并重开后 SVG 断言通过。
- [x] FIDELITY-04：隔离 Runtime 工作台完成 16 类 Procedural、8 类 Control、10 类 Structural 关系创建，以及 Effect 与结构关系保存重开；Effect 在 390px 窄屏仍可访问画布。前端 241 项测试、typecheck、lint、build、`git diff --check` 通过。

画布截图中多条关系使用默认位置时存在重叠，逐项形态以提交时及重开后的 SVG 断言核对。另一次扩展主路径 E2E 在执行视口检查前遇到“校验结果过期”，该失败不计入本任务通过项。
