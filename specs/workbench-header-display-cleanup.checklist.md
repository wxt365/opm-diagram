# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。repo-profile 和 task-type 文件缺失。

## Lean Spec
目标：隐藏工作台标题末尾方括号中的 64 位十六进制哈希及页面 profile 标签。非目标：修改模型实际名称、其他页面或嵌入 API。
允许：WorkbenchSurface.vue、WorkbenchView.vue、WorkbenchView.spec.ts 和本文件；文档和测试允许。禁止：其他文件、公共 API、schema、配置和依赖。
契约影响：无。验收 A1 标题隐藏哈希后缀，普通名称保留；A2 页面不展示 profile；A3 定向测试、类型检查通过。回滚仅撤销本轮差异。

实现顺序：标题使用显示表达式移除哈希后缀；页面停止启用 show-profile；更新现有断言并验证。

Checklist 引用：`Plan#Lean Spec`
- [x] 边界确认：仅允许文件，保留工作区已有修改。
- [x] A1/A2/A3

验证：工作台及嵌入组件 126/126 测试通过；typecheck、三个相关文件 ESLint 通过。哈希后缀及普通方括号名称示例校验通过。未运行浏览器视觉验证。
