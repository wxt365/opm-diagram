# 每个 OPD 固定一个助手会话

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

## Spec

目标：每个项目/模型/OPD 固定一个工作台助手会话。自动恢复，无需选择或新建会话，删除常驻刷新；失败时保留重新连接操作。

非目标：改变模型真值、命令权限、跨图范围、供应商或 Harness 协议；不清空、合并或删除历史，不新增重置功能。

允许：助手 store/service 与定向测试、AssistantPanel 及组件测试、助手浏览器用例、相关设计/运行文档和本规格。禁止：Java 后端、数据库 schema、公共 Runtime API、依赖、密钥、用户模型、`.harness/` 和无关文件。保留已有未提交变更。

契约：助手 list 返回唯一会话（首次自动创建），create 保持路径但改为幂等返回同一会话，响应结构不变。会话文件增加可选 primary 标记，旧格式兼容；同 scope 并发获取串行化。旧多会话优先选正在生成/有 pending 回执的一条，其次最近更新且有内容的一条，再选空会话；标记后稳定绑定，重启不重新选择。其他旧记录完整保留，不混入 Harness 历史或重定向原提案。

验收：SS-01 同 scope 并发/重启身份一致，不同 OPD 隔离；SS-02 旧多会话无数据丢失且绑定稳定；SS-03 自动恢复/切图/错误重连/只读保护；SS-04 真实 DeepSeek 多轮建模、预览应用、停止续聊以及桌面/窄屏效果通过。

验证：Node 存储/服务幂等测试、Vue 面板测试、隔离项目真实浏览器七轮及安全回归、类型/lint/build、差异与文档链接。回滚：撤销本次代码，primary 为向后兼容附加字段，历史与已应用模型保留。

## Plan

先补充稳定绑定与旧历史兼容规则，再简化面板、失败重连和测试入口，最后重启助手并验证真实模型和截图。

## Checklist

引用：本文件 Spec；允许目录、持久化兼容规则与非目标已确认。

- [x] SS-01
- [x] SS-02
- [x] SS-03
- [x] SS-04

## 验证记录

2026-10-05：

- SS-01、SS-02：`npm run assistant:test` 16 项通过；覆盖同 scope 20 并发首次创建/恢复、重启身份稳定、不同 OPD 隔离、旧多会话保留、pending 优先及正常历史时间不改写。
- SS-03：AssistantPanel 5 项及 WorkbenchView 92 项定向测试通过。真实浏览器模拟 list 503 后输入禁用，重连恢复原会话及 23 条历史；确认没有会话下拉、新对话和常驻刷新，list 单条、create 幂等。截图：`/private/tmp/opm-assistant-single-session-reconnected.png`。
- SS-04：真实 `deepseek-flash` 主浏览器用例通过（36.5 秒），覆盖七轮对象/状态/过程/关系/改名/布局提案、画布预览应用、OPL、保存重开和只读；桌面、780 与 390 像素截图已人工检查。输出及独立模型身份：`/private/tmp/opm-assistant-single-session-final/`。
- 助手重启后，安全浏览器 2 项通过（22.9 秒），覆盖固定会话身份及多轮恢复、取消零写入、旧 token 冲突、父子图切换和共享修改阻断、停止后同会话读取续聊。输出：`/private/tmp/opm-assistant-single-session-final-safety/`，与主用例身份目录分开。
- 首次安全回归在改名请求处未生成提案，实际回答为请求确认；改为明确要求直接提出提案后，用新的主用例隔离模型完成回归。停止续聊断言已强化为等待本轮运行结束并检查最后一条回答，避免旧状态文本造成误判。
- typecheck、lint、build（包含契约检查）、`git diff --check`、本次文档相对链接检查及变更范围/前端构建产物凭据扫描通过；前端 5177、Runtime 17850 和助手 17860 保持运行。验证不代表完整 ISO 符合性、生产部署或所有供应商网络故障覆盖。

## 本轮完整变更清单

- `apps/assistant/src/store.mjs`
- `apps/assistant/src/service.mjs`
- `apps/assistant/test/service.test.mjs`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-assistant.spec.ts`
- `tests/e2e/workbench-assistant-safety.spec.ts`
- `apps/assistant/README.md`
- `docs/design/opm-conversational-modeling-design.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `specs/opm-assistant-single-session-task-spec.md`

以上部分文件同时包含此前助手实施或左侧迁移的未提交变更；本轮保留这些改动，没有提交代码。
