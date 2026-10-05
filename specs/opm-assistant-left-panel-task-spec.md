# 智能助手迁移至左侧工作区

Work Mode：change；Risk Level：L2；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

## Spec

目标：用户折叠底部和右侧属性区后仍能在左侧使用智能助手；左侧以 OPD 导航/智能助手页签切换，复用现有宽度调整。导航和助手分别记住本页调整宽度，助手默认 360 像素。切换页签保持当前对话、输入和生成订阅。

非目标：改变模型调用、执行协议、共享语义权限、持久化结构或后端服务；不改全局主题和无关布局。

允许：WorkbenchView、WorkbenchBottomPanel、WorkbenchNavigatorResizer、AssistantPanel、BottomTab 类型、相关组件/浏览器测试、助手运行说明和本任务设计/验收文档。禁止：后端、API/schema、依赖、用户模型、`.harness/` 和范围外文件。保留既有未提交实现。

契约：移除底部助手页签；左侧助手独立于 bottomPanelExpanded/inspectorOpen。首次打开时挂载，其后通过 v-show 保留组件；切 OPD 仍按已有范围更新会话。窄屏采用现有上下排列，在助手页签为对话提供固定可滚动高度。

验收：LP-01 左侧页签切换及独立宽度；LP-02 折叠底部/属性后助手可用且切换保留输入、会话和预览；LP-03 真实 DeepSeek 对话预览/应用及切图/只读不回归；LP-04 桌面、中屏、窄屏布局和类型/lint/定向测试通过。

验证：组件测试覆盖切换及宽度；隔离项目真实浏览器建模，截图检查布局，已有助手 E2E 同步新入口；不使用用户模型。回滚只撤销本任务增量，已应用模型及历史保留。

## Plan

先将助手挂载与底部状态解耦，接入左侧页签和两套宽度；再调整侧栏排版和测试入口，最后检查真实浏览器折叠、切换、建模与窄屏。

## Checklist

引用：本文件 Spec；边界已确认，上述路径允许，API/schema/配置/依赖禁止。

- [x] LP-01
- [x] LP-02
- [x] LP-03
- [x] LP-04

## 验证记录

2026-10-05：

- LP-01/LP-02：`WorkbenchView.spec.ts` 新增侧栏测试，导航 250/助手 380 像素分别恢复，折叠底部后切换保留同一个输入节点与草稿文本；双击助手恢复 360 像素。真实浏览器连续拖动到 400、切回导航 230、返回助手 400、双击恢复 360 均通过；生成中切换页签保持会话并接收提案，预览中切换保持画布，取消后 token 未变。中屏最小 180 像素下输入及发送按钮未溢出。
- LP-03：`OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/private/tmp/opm-assistant-proof.json npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant.spec.ts --output=/private/tmp/opm-assistant-left-e2e`：1 项通过，41.7 秒。底部折叠、属性关闭，真实 `deepseek-flash` 七轮建模、预览退出零写入、应用、OPL 和保存重开一致，历史版本输入禁用。
- LP-03：使用该主用例输出的 `assistant-scope.json` 执行 `workbench-assistant-safety.spec.ts --output=/private/tmp/opm-assistant-left-safety`：2 项通过，24.4 秒。页面重新打开恢复历史，导航/助手切换及父子图会话隔离、共享影响阻断、取消、手工冲突、重复应用、停止后续聊通过。本次迁移没有在七轮与安全用例之间再次重启助手，不把本次页面恢复称为服务重启证据；服务重启证据保留在先前实现记录中。
- LP-04：定向 `WorkbenchView` 92、`AssistantPanel` 3、`WorkbenchNavigatorResizer` 8，共 103 项通过；typecheck、lint、build 及构建中的契约检查通过。1600×1100、780×900、390×844 截图已人工检查，助手在桌面左侧完整可用，手机沿用上下排列；底部折叠释放画布高度。最终格式与本次文档链接检查通过。

浏览器起始因三个服务已退出返回 connection refused，使用原数据目录重新后台启动后测试通过。未修改用户模型；测试项目仍为既有隔离项目，主用例新建独立模型，附加提案已取消。

截图位于 `/private/tmp/opm-assistant-left-e2e/workbench-assistant-真实-DeepSeek-多轮提案、画布预览、应用、保存重开与只读保护/`；最后的折叠与提案预览截图为 `/private/tmp/opm-assistant-left-preview.png`。未改后端、schema、依赖，不重跑 Maven 或供应商故障注入；本次验证范围为侧栏交互和实际模型建模路径。宽度/左侧页签只保留在当前页面，刷新默认回到 OPD 导航，已有对话由服务恢复。
