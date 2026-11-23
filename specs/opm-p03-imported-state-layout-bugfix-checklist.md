# 已导入状态加载布局修复清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：`specs/opm-p03-imported-state-layout-bugfix-task-spec.md`

- [x] 边界确认：仅前端布局/测试/组件接入，无后端、schema、API 或依赖新增。
- [x] IMPORT-STATE-01：实际投影对应子图 8 个状态在 X6 中均在 owner 内，24 节点/21 连线，浏览器零异常。
- [x] IMPORT-STATE-02：定向用例覆盖远端旧坐标、保留合法手工位置、缺失 owner 和只读引用边界。
- [x] IMPORT-STATE-03：组件用例覆盖加载零写入、批量保存、失败保留和保存重开；只读精确版/快照不写入。
- [x] IMPORT-STATE-04：组件用例覆盖首开、子图切换、外部同步，原新增/改名/拖动回归通过。
- [x] IMPORT-STATE-05：9 文件 188 项 Vitest、4 项 Chrome Playwright 通过；类型检查/lint、组件及宿主构建通过。platform.9 已安装，3000 已 --force 重启。

证据：`.codex/imported-state-browser-report.json` / `.codex/imported-state-browser.png`（忽略的本地验证产物）。
真实项目浏览器验证使用精确版本读取，没有提交业务数据修改；可编辑保存链路由组件回归覆盖。
关键实现：`state-layout.ts`、`stateLayout.ts`、`workbenchLayout.ts`、`workbenchRuntime.ts`；平台仅更新组件依赖及 vendor 包。
