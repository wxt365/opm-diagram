# 全局滚动条样式

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## Plan
### Lean Spec
- 元数据：change / L1 / refactor / none (primary)。
- 目标：全系统横纵滚动条统一浅灰轨道、灰色圆角滑块，Chromium/Safari 宽高 8px；Firefox 使用原生 thin 近似宽度。
- 非目标：修改滚动容器、滚动行为或页面布局。
- 允许：foundation.css、workbench-tools.css、workbench-panels.css、本规格；禁止 API、schema、配置、依赖及其他文件。
- 契约影响：无。
- S1：全局样式在主应用和嵌入工作台复用；移除局部 thin 避免覆盖 8px；hover 加深滑块。
- 验证：lint、diff 检查及样式入口核对；手工查看导航、属性、助手、底栏和横向工具栏。
- 回滚：移除新增全局规则，恢复局部 thin。

### 顺序
1. 添加全局伪元素样式与 Firefox 回退。
2. 清除两处局部宽度规则。

### Checklist
- [x] Spec：Plan#Lean Spec；边界已确认。
- [x] S1：主应用与嵌入工作台均导入 foundation.css，局部 scrollbar-width 已清除；lint、diff 检查通过。CSS 未经浏览器视觉验证；Firefox 不支持精确像素宽度，使用 thin 回退。
