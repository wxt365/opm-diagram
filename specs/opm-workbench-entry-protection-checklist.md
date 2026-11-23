# Plan / Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec：specs/opm-workbench-entry-protection-spec.md

边界确认：相关前端组件/helper/测试、使用文档、specs 允许；公共 API/schema/配置/依赖/后端禁止。
实现顺序：底部定位事件交由 Surface 统一提交；工具栏关闭走相同入口；暴露 State 脏/提交中状态供导航刷新保护；Surface 比较已装载图的特征 ID，仅新增特征补充折叠选择，加载/切换重置基线；定向后全量验证。

- [x] AC1：WorkbenchView 实际 OPL/工具栏点击，失败保留输入与面板/选择，成功自动提交后继续。
- [x] AC2：WorkbenchView beforeunload 可取消事件，覆盖仅改角色、改名、失败、模型已更新但提交未完成、成功解除及卸载清理。
- [x] AC3：WorkbenchView 新 owner 首次新增特征、显式展开后重读、加载恢复；既有 OpdCanvas 空/部分列表及快照测试通过。
- [x] AC4：最终前端 80 文件、770 项通过；lint、vue-tsc + Vite build、git diff --check 均退出码 0。

最终证据：test-results/entry-protection-unit.log、entry-protection-lint.log、entry-protection-build.log。此前定向首次运行中，折叠用例的匿名 Canvas 测试替身无法按名称定位，补充替身名称后集成用例通过，再执行以上全量验证。
未执行浏览器端提示框、真实浏览器矩阵或后端测试；本轮只修改前端，不将 beforeunload 事件检查表述为浏览器提示框验证。生产构建保留既有 bootstrap script 和超过 500KB 分包提示。
