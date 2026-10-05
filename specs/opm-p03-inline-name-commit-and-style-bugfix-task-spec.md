# P03 节点名称失焦提交与无边框编辑修复

Work Mode：change；Risk Level：L2；Task Type：bugfix。
Active Playbooks：frontend-vue (primary)、testing。状态：设计冻结，N01～04实现及定向验收完成（2026-09-14）。

## 目标、根因与边界

双击 Object/Process 输入名称后点击画布应提交，不能静默丢弃。现有 handleNameBlur 直接关闭覆盖层，继承旧规格“失焦取消”；此前测试只验证 Enter/Ctrl+S 提交及失焦取消，没有覆盖普通画图时点击画布完成输入。输入框2px边框与全局 input:focus-visible 2px outline叠加产生用户截图中的双框。

允许修改：本规格、对应checklist、原element-name-editing规格第8节、组件交互设计的名称交互说明、OpdCanvas.vue及其spec.ts、base.css中opd-name-editor局部规则、新增tests/e2e/workbench-inline-name.spec.ts。测试使用独立临时SQLite/17851/5176；不改用户模型。保留当前目录所有前序差异，不建worktree、不提交。

禁止：公共API、Schema、后端、保存策略、命令授权/去重、Profile、依赖、其他主题和布局重构。V2继续走UPDATE_PROPERTY→草稿日志→同token投影/OPL回读，V1沿用已有Revision路径。

## 唯一交互规则

Enter及失焦提交同一名称命令；Escape取消；同名关闭不写入。中文IME确认Enter不得误提交。IME中失焦延后到compositionend及Vue最终input值更新后提交；连续blur/Enter不得重复提交。同一覆盖层在途提交互斥；失败恢复输入和焦点，不能当作取消。组件卸载或切换编辑目标后，旧异步结果不得关闭新输入框。点击另一节点双击前必须先完成原输入，失败不得覆盖未成功的名称。

覆盖层位于节点文字中心，字体与13px/600节点标签一致并跟随缩放；无边框、无outline、无阴影，仅保留光标/文字选区反馈。局部覆盖focus-visible，不删除全局可访问焦点样式。Object与Process宽度分别取节点内宽和中央75%区域，输入高度为缩放后的26px并限制在节点内；跟随平移/缩放。提供中英文编辑说明。取消恢复原标签，成功由Runtime回读正式标签。

## Plan、验收、回滚

先添加失败回归→复现blur零提交→修复事件与局部样式→组件回归→隔离真实前端新建/中文改名/刷新和OPL检查→截图与构建检查。

- N01：失焦修改一次提交，未修改/Escape零提交；Enter/blur重入不重复。
- N02：IME确认不提交，composition中失焦等最终输入；失败输入与焦点保留，旧异步结果不干扰新编辑。
- N03：真实V2 Object/Process中文名称提交成功、OPD/OPL一致、刷新恢复；无改名时不新增编辑序号。
- N04：正常及focus-visible无内边框/阴影，缩放和平移定位；桌面截图验证；组件测试、typecheck/lint/Node22 build、diff通过。

回滚只撤本包文件增量；不删除任何已成功命令或数据库。验收记录见独立checklist；不扩展为全软件或发布符合性验收。
