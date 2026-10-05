# P03 切换 OPD 时加载提示布局稳定性

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：none (primary)。仓库当前没有 `.harness/`，本任务不创建该目录。

## 目标与非目标

切换已有 OPD 时，不让临时的“正在读取 Local Runtime 工作台会话”提示插入画布上方并改变工作区高度。首次打开工作台仍显示加载提示；读取失败仍显示错误。本任务不改变 Context 导航、画布内容、草稿读写或错误恢复。

## 边界与契约

允许修改 `apps/web/src/modules/workbench/WorkbenchView.vue` 及其定向测试、本规格和 `docs/checklists/` 对应 Checklist。禁止修改现有多层 OPD 的其他脏文件、后端、公共 API、schema、配置、依赖、用户数据和 `.harness/`。只调整加载提示的显示条件，不改变 `resourceState` 及路由契约。

## 验收与验证

- LS-01：已有 Context 的 OPD 切换处于加载中时，顶部提示不出现，工作区仍保持原内容和位置。
- LS-02：首次打开工作台时显示加载提示；读取失败仍可见错误。
- LS-03：定向前端测试、类型检查、lint、构建和差异检查通过；能运行浏览器验证时检查切换前后工作区几何。

Plan：先以延迟读取测试重现切图加载态，再收紧提示的显示条件，最后验证布局与回归。

回滚：撤销本任务前端展示条件和测试增量，无数据迁移。
