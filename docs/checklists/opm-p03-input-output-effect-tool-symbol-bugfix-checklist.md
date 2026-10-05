# P03 输入输出状态影响关系工具图标 Checklist

规格：[输入输出状态影响关系工具图标修复](../../specs/opm-p03-input-output-effect-tool-symbol-bugfix-task-spec.md)。

边界：仅允许本规格、Checklist、关系工具图标映射、组件及定向测试；不改 API、Schema、数据库、配置、依赖、后端、用户模型或画布渲染。

- [x] SYMBOL-01：新增三端点、两段单向线断言，修复前因 `closed-both` 失败，修复后定向 8 项通过。
- [x] SYMBOL-02：其他图标保持原分支；前端完整测试 232 项通过。
- [x] SYMBOL-03：Node 22 下 typecheck、lint、build、`git diff --check` 通过；Playwright 在桌面 1440×900 和窄屏 390×844 核对实际菜单，图标均为 42×20 且三端点与两段箭头可见。
