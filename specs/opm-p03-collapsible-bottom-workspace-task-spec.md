# Spec: P03 可折叠底部工作区与紧凑只读提示

Work Mode：`change`；Risk Level：`L2`；Task Type：`feature`。
Active Playbooks：`frontend-vue (primary)`、`testing`。

状态：2026-09-11 设计冻结、实现与本地验收完成，证据见对应 Checklist。

## 目标与边界

优先为画布提供空间：只读提示并入顶部状态区，底部文本/问题/历史/方法区域可以收起，校验状态并入底部标签栏。

允许：WorkbenchView.vue、workbenchRuntime.ts、base.css、WorkbenchView.spec.ts、tests/e2e/workbench-layout.spec.ts、本规格、对应 Checklist、组件交互设计、状态模型及冻结基线；另允许 workbench-relation-gesture.spec.ts 仅补刷新后真实 X6 路径就绪的等待，保留路径一致性断言。
禁止：Runtime、API、Schema、SQLite、Profile、依赖、路由语义、用户模型数据、其他工作区/发布证据；保留当前目录中的既有未提交修改。

## 冻结行为

1. 就绪只读模式在现有 Header 中显示带锁图标的“只读”标签，完整原因通过中英文 title/aria-label 提供；不再添加整行只读 banner。真实写入守卫不变。
2. 初次进入保留展开的 OPL 视图，兼容已有阅读流程。用户收起后，同一挂载会话内的提交、选中、Context/Revision 切换不自动展开或重置；不写 URL、Revision 或持久化数据。
3. 底部共享 38px 标签/状态栏；右侧箭头显式收起或恢复原标签；展开时再次点击活动标签可以收起，收起时点击任意标签展开该内容。程序调用 setBottomTab 代表明确的打开意图。
4. 折叠隐藏全部底部内容，校验状态和阻断计数依然可见，运行中的校验进度可观测；问题标签保留数量。收起/展开有中文/英文提示、aria-expanded、aria-controls 与键盘可操作按钮。
5. 校验状态从独立 43px 行并入共享标签栏。桌面展开面板仍为 240px，收起为 38px；可见画布增加 202px，合并校验栏另回收 43px。窄屏允许标签横向滚动，折叠不留下原面板 min-height 空白。
6. 保留所选标签、问题选择和当前文本数据，OPL/Trace 数据继续刷新。既有 capture 的 FINDINGS/HISTORY bottomOpen 在折叠时为 false、bottomMode 为空；不新增其枚举，OPL/方法沿用既有 capture 语义，不作为新的发布证据。

## 计划

复用现有底部标签状态，新增本地展开位和切换方法；调整三行 Grid 与标签栏；再验证只读 Header、折叠后的真实画布增高、数据/URL 不变及重新展开后的可用性。

## 验收与回滚

- SPACE-01：只读标签在 Header 内且无额外通知行，编辑仍禁用。
- SPACE-02：全部底部标签可收起/恢复，键盘按钮可用，状态/数量保留；新提交不会强制展开。
- SPACE-03：桌面画布收起后增加 202px；窄屏无底部空白；折叠不改变 URL、Revision、选择或模型数据。
- SPACE-04：Web 单元、lint、typecheck/build、定向 Playwright、截图检查及 diff 检查通过。

回滚仅撤销本轮文件增量，恢复固定展开区域和独立只读/校验行，无数据迁移。
