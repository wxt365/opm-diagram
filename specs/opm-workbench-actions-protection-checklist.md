# Plan / Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/opm-workbench-actions-protection-spec.md

边界确认：相关前端及测试/文档/specs 允许；公共 API/schema/依赖/配置/后端禁止。
实现决策：Surface 菜单/双击/细化/删除统一等待 finishInputs 并核对位置；导航快捷键通过回调复用 requestLayoutHistory；默认 helper 路径同样检查输入。先补失败/成功实际入口测试，再全量验证。

- [x] AC1：WorkbenchView 新增实际菜单请求/直接删除/关系双击及已打开菜单的细化/删除失败阻断与成功继续用例；入口等待后核对 route，菜单动作另核对目标。
- [x] AC2：实际工作台快捷键失败阻断/成功继续；helper 回调复用、默认输入失败与位置变化阻断；既有输入框原生撤销、模式限制用例通过。
- [x] AC3：最终 80 文件、773 测试通过；lint、vue-tsc + Vite 生产构建、git diff --check 退出码均为 0。

证据：test-results/actions-protection-unit.log、actions-protection-lint.log、actions-protection-build.log。定向首次运行暴露既有快捷键同步断言未等待新增输入检查，补 await；细化新用例改用支持细化的可编辑草稿夹具后通过，再执行最终全量验证。构建仍有既有 bootstrap script/超过 500KB 分包提示。
本次未执行真实浏览器 E2E 或后端测试；组件测试验证实际 Vue 入口事件及键盘分发，不声称浏览器矩阵通过。
