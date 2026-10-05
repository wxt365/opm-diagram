# Spec: P03 连线上关系名称编辑

Work Mode：`change`；Risk Level：`L3`；Task Type：`feature`。

Active Playbooks：`frontend-vue (primary)`、`testing`。

状态：2026-09-11 设计冻结、实现完成；本地验证见对应 Checklist。

## 目标与非目标

带标签关系创建时在实际连线路径上输入名称；双击已提交的带标签结构关系可就地编辑标签。无标签关系、Control 注记和标准关系类型名称不得通过该入口改名。

允许修改 WorkbenchView.vue、OpdCanvas.vue、workbenchRuntime.ts、base.css、对应组件测试、tests/e2e/workbench-layout.spec.ts、本规格/checklist、组件交互设计及冻结基线。禁止修改 Runtime、公共 API、Schema、SQLite、Profile、依赖、URL 策略、发布证据及用户运行数据。

## 冻结契约

1. 创建沿用 Runtime CREATE_FACT option；双击沿用 Runtime UPDATE_FACT option，只有允许 labels 的 option 才打开编辑器。标签映射到 labels[].slot_id/text，不是 Fact 或 Capability 名称。
2. X6 只发出关系 ID 的编辑意图和屏幕几何；输入框使用实际 EdgeView 路径上 forward_tag 的 0.35 位置（无标签参数取 0.5），而非端点中心平均值；缩放、平移、resize、路径变化均重新定位。边界处限制在可见画布内，路径不存在时隐藏而不回退右上角。
3. 2026-09-11 视觉修正：标签输入采用 120px 宽、24px 高、12px 字体的无边框线上文本，外层透明且无阴影，无可见标题行。单向“关系名称”和双向正/反向名称通过 placeholder、title、aria-label 提供；小取消图标置于旁侧，不占标题行。输入最长 256，必填值不得全空白。验收见 opm-p03-borderless-relation-label-checklist.md。
4. Enter 提交、Escape/关闭取消；中文输入法组合期间 Enter 不提交。失焦保留输入；同名编辑不产生命令或 Revision。提交期间禁用输入及重复提交，失败保留输入。切换构造/Context/Revision/工具时取消旧编辑，过期异步授权不得打开编辑器。
5. 双击编辑仅提交 labels replacement；保留原 Fact ID、端点、方向、完整性和未修改标签。提交前复核同 Revision exact Runtime option，成功一条 UPDATE_FACT、一次 Revision，重开后标签和 OPL一致。原有属性检查器的完整结构关系编辑继续可用。
6. 创建候选仍不形成 committed Fact/OPL/Trace；内联编辑不强制打开属性栏，不改 URL 或布局持久化规则。

## 计划

先接通 EdgeView 几何与双击意图，再复用 Store 的结构关系授权和提交边界，最后将创建/更新表单放在连线锚点并完成回归。

## 验收与验证

- EDGE-LABEL-01：创建输入位于连线上，平移/缩放时跟随且无布局跳动。
- EDGE-LABEL-02：双击带标签关系可改名；无标签/只读不打开；同名、取消、空白和组合输入零提交。
- EDGE-LABEL-03：exact option 守卫、仅 labels 更新、失败保留及重开后的名称/OPL一致。
- EDGE-LABEL-04：Web 单元、lint、typecheck、build、相关真实 Playwright 与 diff 检查通过。

回滚仅撤销本包增量，保留前序未提交修改；恢复右上角创建输入和属性栏编辑入口，无数据迁移。
