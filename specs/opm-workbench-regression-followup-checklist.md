# Plan / Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/opm-workbench-regression-followup-spec.md

边界已确认：仅相关工作台实现、测试、文档和 specs；API/schema/配置/依赖/后端禁止修改。

实现顺序：复用检查器统一提交入口，比较 State 已确认模型判断成功并合并进行中的提交；将默认折叠决策放在 Surface，画布尊重显式列表；补失败/并发/重挂载用例，定向后全量验证。

- [x] AC1：WorkbenchInspector + WorkbenchView 保存/选择/离开失败及重试测试。
- [x] AC2：WorkbenchInspector 无变化及重叠提交测试。
- [x] AC3：OpdCanvas 空/部分列表、异步恢复及两次挂载测试；既有工作台与快照回归通过。
- [x] AC4：最终前端 80 文件、768 项通过，lint、vue-tsc + Vite build、git diff --check 均退出码 0。

验证日志：test-results/regression-followup-unit.log、regression-followup-lint.log、regression-followup-build.log。构建保留既有 bootstrap script 与大分包提示。未重跑浏览器及后端，本轮仅修改前端输入/折叠与离开流程。集成测试直接调用实际组件暴露的 prepareLeave；路由守卫由既有 View 调用此入口，不声称本次执行了浏览器路由验证。
