# 校验关系删除与窄屏溢出修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。repo-profile/Task Type/playbook 文件缺失，遵循 AGENTS.md。

## Spec

目标：校验定位后能通过真实关系命中打开正确菜单并删除错误关系；390px 保存/历史返回后页面无横向溢出。
非目标：放宽对象依赖删除保护、JSON迁移、密集性能、发布脚本。
允许：apps/web/src/modules/workbench、相关 stores/workbench 的本次交互实现与测试、apps/web/src/shared/styles 的局部响应式样式、tests/e2e 对应回归及辅助定位、本 Spec/Checklist。禁止：后端、API/schema/依赖/配置/业务数据、.harness、无关重构。外部契约不变。

验收：
- AC1：校验并跨图定位后，实际命中错误关系，菜单删除目标为 FACT，删除成功并重新校验/保存重开；普通对象依赖保护保持。
- AC2：390px 首次加载、保存、精确版本/返回 HEAD、连续视口切换无横向溢出；检查器/菜单/长名称不越界，不以裁剪整个页面隐藏问题。
- AC3：定向与完整前端单元、lint、类型/构建、浏览器校验闭环和保存/窄屏回归实际执行。

证据与假设：原 trace 的 DELETE_CONSTRUCT selection 对应 ELEMENT，直接删除禁用码 DELETE_DEPENDENCY_EXISTS，CASCADE 可用；原测试 force 点击路径中心而非真实线段。先修正真实命中回归，若产品命中本身仍错误，再做实现修复。窄屏根因须记录实际越界元素后修改。

Plan：复现真实关系命中与窄屏越界；最小修正交互/测试和样式；完整闭环验收。回滚仅本次差异，保留已有未提交修复；所有测试使用新建临时数据。

## 根因与实现

关系删除：原 trace 实际查询 ELEMENT，因依赖正确禁用 DELETE_TARGET，同时 CASCADE 可用。测试强制点击 SVG 路径包围盒中心命中下方对象，且没有进入真实连线右键的“关系操作”入口。修正为寻找真实命中目标 edge 的线段点、真实右键、关系操作、明确选择“删除关系”，不改生产删除逻辑或后端依赖保护。原“校验后无法删除关系”结论更正为验收误命中。

390px：连续桌面/窄屏切换复现 scrollWidth=394；navigator-resizer 的 right:-4px、width:8px 在 Vue resize 更新前仍存在，边界 x386→394。增加组件 scoped 的 max-width:680px 媒体规则即时隐藏，与既有堆叠布局同断点；不使用 body overflow 隐藏页面。
