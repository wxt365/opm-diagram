# HS-03B 工作台草稿与显式保存

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：frontend-vue (primary)、testing。状态：本切片实现与隔离验收完成（2026-09-14），不代表用户库已激活 V2。

## 1. 目标和边界

承接 [HS-03A](opm-hybrid-save-browser-delivery-task-spec.md)，接入已激活 V2 模型的画布、候选、十三类命令、保存按钮/Ctrl或Cmd+S、Pin 永久链接及 Runtime 保存状态。不通过延迟 V1 命令冒充混合保存。

当前目录 HEAD=2180f3823a547878f15c6dd2d2b11030718a0efa；保留全部既有差异，不使用 worktree、不提交、不改用户数据库。未交付在线迁移、离线建模、强停/容量证明、完整规则校验、Context CRUD、Snapshot/Baseline/Export 业务流程。失败待确认输入保留并提供原请求恢复；显式放弃/重编辑冲突输入仍需后继契约，不自动丢弃。

允许精确文件：

- 本规格与 `docs/checklists/opm-hybrid-save-workbench-checklist.md`。
- `docs/checklists/opm-hybrid-save-implementation-checklist.md`、`docs/design/opm-hybrid-save-and-draft-recovery-design.md`。
- `apps/web/src/shared/api/draftWorkbenchSession.ts`、`draftWorkbenchSession.spec.ts`（同目录）。
- `apps/web/src/shared/types/workbenchCapability.ts`。
- `apps/web/src/stores/workbenchRuntime.ts`。
- `apps/web/src/modules/workbench/WorkbenchView.vue`、`WorkbenchView.spec.ts`、`OpdCanvas.vue`、`OpdCanvas.spec.ts`。
- `apps/web/src/modules/workbench/opd/core/relation-preview-renderer.ts`。
- `apps/web/src/modules/workbench/opd/core/transformation-tool.ts`：只声明实际消费的四个展示字段。
- `tests/e2e/workbench-hybrid-save.spec.ts`。
- `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftBrowserFixtureTest.java`。

允许内部 API 类型、组件/Store/服务及测试；不改公共 HTTP、生成契约、SQLite DDL、Runtime 生产逻辑、依赖、Profile、发布工件。Java 仅测试夹具：复用 DraftWorkspaceTestDatabase，在独立空临时目录显式注册 V4/V5；不新增生产激活入口。

## 2. 冻结行为

HEAD 先 OpenDraft；仅明确 DRAFT_MODE_REQUIRED 回 V1，404/网络/资产/恢复错误不能降级。EXACT 仍走 V1 统一历史读，永远只读。V2 元数据可读项目/模型目录，但禁止从 V1 HEAD 获取当前投影/文本/问题/候选。Header 显示活动草稿编辑序号，真实最近 Revision 仅用于历史、提示和精确链接；不伪造 Revision、QueryEnvelope 或候选 expires_with_revision。

草稿导航、投影、文本、问题、关系目录以同一 DraftToken/Context 查询，逐响应 request_id/token/context 核对后一次应用。任一错误不应用部分结果。所有异步结果受页面加载世代及 token 双守卫；选中操作的候选另保留原 scope，提交引用 exact query/option/token。删除必须匹配 Runtime impact；未带显式授权的创建节点、移动、State 展示先查询相应 intent，仅从唯一匹配的 enabled option 取得授权。前端不重建候选 ID。V2 只消费现有可渲染端点类型，未知值稳定拒绝，不能静默丢字段。

十三类生成命令走 DraftDelivery：提交前去掉 V1 payload 中的 capability_query_id/selected_option_id，置入 V2 authorization。仅去掉尚未定义的可选对象字段 undefined，保留 null、数组顺序和 -0；最终发送 raw 由 HS-03A 冻结。候选缓存按 token 失效；不把编辑结果的 DURABLE 显示为“已手动保存”。旧快捷 Consumption payload 不允许在 V2 回退 V1，关系使用现有 Runtime 目录流程。

保存按钮放入现有单行工具栏，用保存图标及中英文 tooltip；旧 V1 已逐命令保存且不启用 V2 保存按钮。点击/快捷键先等待已发出的编辑；名称/标签输入依原规则提交，IME和无效输入不保存且保留；其他未完成候选明确阻断，不隐式创建业务内容。保存开始即捕获当时 token，之后新编辑不等待保存；同一显式保存进行中不叠加请求。保存成功只更新历史/保存状态，不用 captured token 覆盖新投影。无变化点击由 Runtime UNCHANGED 去重。快捷键仅当前工作台处理，卸载撤销；EXACT 不提交。

状态轮询每2秒调用 OpenDraft POST，禁止前端 AUTO 保存定时器。仅与当前 token 一致时应用 save_state；若外部编辑推进 token，停止本地编辑并提示重新加载，不在用户输入期间静默替换。状态优先级：待确认/失败 > 显式保存中 > Runtime in_flight > dirty > 最近已手动保存/已自动保存/草稿已保护。V2 核心 Findings 显式 INCOMPLETE，不能以旧 Revision validation task 冒充当前全量校验；旧操作历史不可冒充草稿历史。

初次打开 V2 先恢复两 lane 待确认请求再重新读取，失败保留输入并显示恢复错误；禁止生成新 ID 偷重放。提供“重试待确认”沿用原字节恢复。Pin 也先完成输入/编辑边界，成功后才复制 exact revision URL；导航变化后不得复制另一模型链接。编辑seq、平移缩放、选择和面板不写 URL。

## 3. Plan 与验收

收尾核对补充：OPL 和属性面板以活动草稿编辑序号标识当前输入，不借用最近 Revision。保存来源仅由本会话成功捕获的手动 token 或实际观测到的自动 checkpoint 确认；重开无法判断来源时显示“草稿已保护”，不得从 last_manual_revision 猜测。State 候选在草稿快照应用后重新查询；选择、token 或导航变化后旧候选不得写回，UPDATE_STATE 查询失败保留输入并反馈，不提交命令。

先建立独立 DraftWorkbenchSession，集中同 token 查询/候选授权/传输，Store 只适配 UI。再替换候选的展示类型与过期判断，接保存状态/输入完成方法，最后验证。

- HS-W01：V1/EXACT 不受影响；V2 同 token 原子读取、旧请求不覆盖新导航，错误不降级。
- HS-W02：候选授权和十三类命令生成协议正确；删除impact、旧候选、未知渲染形状明确拒绝；-0保留。
- HS-W03：按钮/快捷键、名称和标签/IME、无变化保存、捕获边界/在途新编辑、失败保留、原请求恢复。
- HS-W04：Runtime 自动保存状态、Pin 后 EXACT、HEAD URL不变、卸载清理；不伪造校验和历史。
- HS-W05：Web 全量 Vitest/typecheck/lint/Node22 build；独立临时 SQLite/Runtime/Chromium 联调与桌面/窄屏检查，记录实际结果。

## 4. 回滚

仅撤销本包增量；不删除 IndexedDB、临时验证库外的任何数据、不回退已激活模型至 V1。V2 读取失败保持关闭编辑；临时测试根保留可复核证据。规格或现实现发现冲突先在本包修订，再实现；不放宽 Runtime 守卫。
