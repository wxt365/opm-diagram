# 多层 OPD 当前图删除恢复 Checklist

规格：[多层 OPD 当前图删除恢复](../../specs/opm-multilevel-opd-local-delete-bugfix-task-spec.md)。

边界：已确认仅允许规格、Checklist、Runtime 删除策略和定向测试；不改 API、Schema、数据库、配置、依赖、前端、用户数据及 `.harness/`。

- [x] DEL-01：多 Context 当前图删除候选和提交。
- [x] DEL-02：本图依赖的阻断与级联行为。
- [x] DEL-03：细化引用和跨 Context 影响阻断，伪造提交零写入。
- [x] DEL-04：Java 21 `DraftWorkspaceControllerTest` 30 项、WorkbenchView 81 项和 `git diff --check` 通过；后端 17850 健康检查为 `UP`。
