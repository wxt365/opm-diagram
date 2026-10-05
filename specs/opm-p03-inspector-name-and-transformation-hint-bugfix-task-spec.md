# P03 属性面板名称编辑与生成/消耗提示修复

Work Mode：change；Risk Level：L2；Task Type：bugfix。
Active Playbooks：frontend-vue (primary)、testing。状态：设计冻结，IP01～04实现及验收完成（2026-09-14）。

## 目标及事实

用户截图选中Object，右侧“名称”仍是form-readonly，且残留“属性更新命令不在P0范围”；实际Object/Process UPDATE_PROPERTY已经支持。此前只验证画布双击入口，未验证属性字段入口。此次仅补截图的对象/过程名称，不扩展Feature/Attribute语义名称的Runtime契约。

生成/消耗当前端点方向正确，问题是复合英文名称与反序的中英混排提示。固定为首行“生成/消耗关系 / Result / Consumption”，次两行“生成 / Result：过程 → 对象”“消耗 / Consumption：对象 → 过程”。常驻与展开入口共用同一来源，按原规则附加不可用原因；不改Capability、Symbol、Fact或方向匹配。

## 范围和接口

允许：本规格、对应Checklist、原组合工具规格、组件交互设计；新增ElementNameProperty.vue及spec.ts；WorkbenchView.vue及spec.ts；opd/core/transformation-tool.ts；tests/e2e/workbench-inline-name.spec.ts。直接当前目录开发，保留前序差异，不建worktree、不提交。禁止后端/API/Schema/SQLite/Profile/依赖、全局样式和用户模型修改。

ElementNameProperty接收elementId/name/readonly、submitNameEdit(id,value):Promise<boolean>及失败反馈。Object/Process名称行用该组件，稳定ID/Occurrence只读。组件按模型位置及elementId建立key，切换目标重建，旧请求捕获原id和值，旧结果不得写进新字段。显示与外部正式名称同步，未提交输入不因轮询被覆盖。

Enter/失焦提交；Escape恢复当前正式名称；同名零命令；IME确认不误提交，IME中失焦等最终input；提交互斥，失败保留输入和焦点。使用store.renameElement复用实时候选/封闭payload/同token回读，不直接修改标签。只读历史不提交。`finishNameEdit`供工具栏保存和Ctrl/Cmd+S等待当前输入提交；失败或IME不保存模型。输入使用单层细边框、紧凑字号，可直接看出可编辑，不叠加全局outline。Feature继续只读且只对其显示准确的未支持说明，不声称全部属性可改。

## Plan、验收、回滚

顺序：面板失败回归→独立字段组件与工具提示→工作台保存入口→隔离真实V2验证→文档结果。

- IP01：常驻/展开提示三行一致、方向及成员不可用原因正确。
- IP02：对象/过程属性栏名称可编辑，走现有命令授权，成功回读；无修改零命令。
- IP03：只读、非法名称、失败保留、Escape、IME、在途保存/目标切换不串写。
- IP04：真实有连线模型的面板改名，画布/OPL同步、保存和刷新恢复；组件/工作台回归、typecheck、lint、Node22 build、diff通过。

回滚仅撤本包差异，不回滚已确认业务编辑。临时测试服务独立端口/存储，不清空或编辑用户runtime-data。不将本包视为完整ISO或其他设计验收。
