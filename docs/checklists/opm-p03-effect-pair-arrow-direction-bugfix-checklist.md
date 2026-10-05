# P03 状态影响关系箭头方向 Checklist

规格：[状态影响关系箭头方向修复](../../specs/opm-p03-effect-pair-arrow-direction-bugfix-task-spec.md)。

边界：已确认仅允许规格、Checklist、Effect 渲染函数与 Relation Registry 定向测试；不改 API、Schema、数据库、配置、依赖、后端、用户模型及其他前端模块。

- [x] EFFECT-01：两项方向断言在修复前失败；修复后定向测试 13 项通过，状态关系各段仅保留终点箭头。
- [x] EFFECT-02：普通 Effect 的往返线段、capture anchor 与非 Effect 关系回归通过；前端完整测试 232 项通过。
- [x] EFFECT-03：typecheck、lint、build、`git diff --check` 通过；Playwright 只读核对桌面 1483x681 和窄屏 390x844（缩放、平移后）画布及 OPL，均显示预期方向。
