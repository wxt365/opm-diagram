# P03 状态过程关系线可见性修复 Checklist

规格：[状态过程关系线可见性修复](../../specs/opm-p03-state-procedural-link-visibility-bugfix-task-spec.md)。

边界：已确认仅前端 OPD 关系渲染、`tests/e2e/workbench-layout.spec.ts` 定向场景及本任务文档；不改公共 API、schema、配置、依赖、后端或用户数据。

- [x] SV-01：二端点状态过程关系与普通关系层级通过定向测试；隔离画布截图已核对。
- [x] SV-02：三端点影响关系和增量更新通过定向测试；E2E 核对四段连线顺序。
- [x] SV-03：OPD 模块 42 项测试、隔离 Playwright 1 项、typecheck、lint、前端 build 通过；截图已检查。
