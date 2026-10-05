# P03 切换 OPD 加载布局 Checklist

规格：[切换 OPD 时加载提示布局稳定性](../../specs/opm-p03-opd-switch-loading-layout-bugfix-task-spec.md)。

边界：仅工作台加载提示条件、定向测试及本任务文档；不改路由、草稿、后端、公共契约或用户数据。

- [x] LS-01：延迟读取测试确认已有 Context 切换时不插入顶部提示，旧工作区仍存在。
- [x] LS-02：首次读取提示由定向测试确认；既有读取失败测试通过。
- [x] LS-03：WorkbenchView 81 项测试、typecheck、lint、前端构建与 `git diff --check` 通过；只读浏览器量测切图前和加载中的 Grid 均为 `y=120`、高 `540`，顶部提示容器数为 0。
