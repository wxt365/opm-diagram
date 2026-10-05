# 助手连续对话回复可见性修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## Spec

目标：用户继续提问后能看到发送状态和最新回复，不被此前生成的方案与展开报告遮住；保留多轮会话、图上预览和统一确认。

非目标：修改 DeepSeek 模型、对话内容及业务语义、开放删除或跨图功能、修改接口或持久化结构、重构工作台、提交代码。

允许：AssistantPanel.vue、其组件测试、专用 e2e 回归、现有 quality e2e 的历史报告展开步骤、助手 README 与本规格。禁止：Java Runtime、数据库、HTTP/schema、依赖和配置、`.harness/`、用户模型和既有会话文件；保留工作区其他已有变更。用户截图对应会话仅做只读核对；真实续聊使用隔离测试模型。

契约影响：无；复用既有 messages/proposals 和 prompt/watch 接口。

复现证据：用户会话 da596742-e573-4062-9844-5234bb757128 的两次追问均已保存且有助手回复，run 为 completed。浏览器恢复该模型后，消息滚动区末尾是三张旧方案卡；最新回复主体在可视区域上方，仅剩尾部可见。截图与几何证据 `/private/tmp/opm-assistant-followup-before.png`、`/private/tmp/opm-assistant-followup-before.json`。源码先遍历全部 messages，再遍历全部 proposals，恢复和更新滚动到底部会进入旧报告。此前 e2e 只检查回复 DOM 内容和会话持久化，没有检查旧展开报告存在时最新回复的位置。

验收：

- FV-01：消息与方案报告独立滚动；已应用或取消的历史方案默认折叠；展开报告不改变消息阅读位置，最新回答可见。
- FV-02：当前待确认/生成中方案仍可查看报告、取消、预览和确认，报告区域有高度上限，不遮住输入框及全部消息。
- FV-03：主动发送（含更正）回到最新消息；发送失败保留输入和阅读位置；后续用户主动上翻历史时，事件更新不强制抢回底部。
- FV-04：真实画布验证生成与一次确认后，展开旧报告，再连续发送两次只读追问；相同会话持续回复、不改模型，刷新恢复与窄屏显示通过。

验证：先增加失败组件回归，再最小修复，执行 AssistantPanel/WorkbenchView 定向测试、typecheck/lint/build；真实 DeepSeek 隔离模型 e2e，检查桌面/窄屏截图和用户原会话只读恢复；最终 diff 检查。

回滚：撤销本轮面板、回归和说明改动；无需迁移或改写历史。

## Plan

将方案报告收纳为独立、可折叠且高度受限的区域，复用现有卡片及控制；消息滚动区只呈现对话和运行状态。发送成功恢复追随最新消息，正常事件仍保留手动上翻。补覆盖可见性而非仅 DOM 存在的浏览器回归。

## Checklist

引用本文件 Spec；允许/禁止目录、接口无变更、用户数据只读和隔离测试边界已确认。

- [x] FV-01：消息与报告独立滚动；已处理历史默认折叠，展开后最新回复仍可见。
- [x] FV-02：待处理方案自动展开并保留原有预览、确认和取消，报告最高占面板 40%，收起入口固定；真实确认、历史报告查看和窄屏操作通过。
- [x] FV-03：成功发送主动回到最新消息；失败保留输入与阅读位置，后续手动上翻不被事件更新打断。
- [x] FV-04：真实 DeepSeek 连续两次追问保持同一会话，最新回复实际可见，无模型写入；刷新及 390px 窄屏恢复通过。

## 验证记录

2026-10-05 实际验证：

- 修改实现前新增的两个组件回归均失败：旧方案仍位于消息滚动区；上翻后发送成功未滚到最新消息。原有 12 项通过。证据 `/private/tmp/opm-followup-failing-test.log`。
- 实现后 `npm run test --workspace=@opm/web -- src/modules/workbench/AssistantPanel.spec.ts src/modules/workbench/WorkbenchView.spec.ts`：14 + 92，共 106 项通过。日志 `/private/tmp/opm-followup-web-test.log`。
- `npm run typecheck`、`npm run lint`、`npm run build --workspace=@opm/web` 通过。最终构建耗时 3.74 秒，保留既有 `/opm-bootstrap.js` 非 module 提示。日志分别为 `/private/tmp/opm-followup-typecheck.log`、`/private/tmp/opm-followup-lint.log`、`/private/tmp/opm-followup-build.log`。
- 首次真实连续追问用例通过，耗时 28.2 秒；截图检查发现报告区域的收起入口会滚走，固定入口后执行最终两项浏览器回归：连续追问 40.9 秒，质量报告 17.3 秒，总计 59.4 秒，均通过。日志 `/private/tmp/opm-followup-final-e2e.log`。没有修改用户原模型或原会话。
- 连续追问用例实际在画布创建两个独立咖啡豆对象，确认保存后展开历史质量与标准报告，从历史上方分别发送两次只读追问。每轮验证运行状态可见、输入清空、回复在消息可视区域末尾、同一会话、无新增提案、画布版本及节点数量不变；刷新恢复与窄屏通过。原质量用例回归同名身份保留、建议不阻断确认、保存恢复及窄屏展开历史报告。
- 用户原会话只读复核：修复前展开质量报告后，最新回复底部 -159.875px，消息可视区域顶部 198px，回复完全不可见；修复后末尾为助手消息，展开报告后回复底部 409.125px，仍在消息可视区域。证据 `/private/tmp/opm-assistant-followup-after.json`、`/private/tmp/opm-assistant-followup-expanded-after.png`。
- 已查看最终连续追问桌面/窄屏、质量报告窄屏及用户原会话桌面截图。报告独立滚动且收起入口保留；折叠历史后有更大消息阅读区域，输入框可操作。报告仅改善显示，不改变标准或质量裁决。
- 本轮 6 个文件的疑似密钥和本地链接扫描通过，`git diff --check` 通过。后端、HTTP/schema 和持久化未修改，无需重复其测试。

最终浏览器命令：

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/private/tmp/opm-assistant-proof.json \
  npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/workbench-assistant-followup.spec.ts tests/e2e/workbench-assistant-quality.spec.ts \
  --output=/private/tmp/opm-assistant-followup-final-e2e
```

该输出目录保留 `followup-proof.json`、`quality-proof.json` 和截图；仅证明本轮对话可见性、现有确认流程及本机真实 DeepSeek 续聊，不扩大跨图能力或完整标准符合性声明。

## 本轮文件

- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `tests/e2e/workbench-assistant-followup.spec.ts`
- `tests/e2e/workbench-assistant-quality.spec.ts`
- `apps/assistant/README.md`
- `specs/opm-assistant-followup-visibility-task-spec.md`
