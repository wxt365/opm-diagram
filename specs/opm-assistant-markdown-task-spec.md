# 助手回复 Markdown 表格显示修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## Spec

目标：截图中的 Markdown 表格显示为有表头、行列和换行的真实表格；助手常见标题、列表、强调和代码正常显示，窄侧栏可阅读历史回复。

非目标：完整 CommonMark/GFM 实现、复杂嵌套排版、图片/原始 HTML 渲染、改变回复或模型内容、重新生成历史、新增依赖、修改后台及接口、提交代码。

允许：工作台内新增 Markdown 子集解析和安全展示组件及测试，AssistantPanel 的回复显示与定向测试，专用 e2e，消息编辑 e2e 的身份栏断言调整，助手说明与本规格。禁止：依赖及配置、API/schema/数据库、Java/助手后台、`.harness/`、用户历史与模型文件和无关工作区改动。浏览器仅只读打开用户原对话，检查真实保存内容的渲染。

复现：用户截图的三列表格显示为带竖线和分隔行的原文；当前面板使用 `<p>{{ message.text }}</p>`，没有 Markdown 结构化渲染。此前测试覆盖正文存在、身份图标、回复可见性与模型保存，未检查真实表格 DOM 和列布局。

契约影响：无。用户消息保留纯文本以方便编辑。助手回复渲染子集；通过 Vue 文本节点和固定标签渲染，原始 HTML 仍显示为文本，链接仅允许 http/https，不执行脚本、不加载远程图片。未知或未完成语法按文本显示。

验收：

- MD-01：截图中的三列表格有表头及两行，单元格换行、对齐、转义竖线与代码中的竖线正确，异常表格安全退回文本。
- MD-02：常见标题、段落、列表、引用、粗体/强调、行内及围栏代码可读，用户消息及编辑内容仍保持原文。
- MD-03：原始 HTML、事件属性和脚本链接不执行；代码内容不误解析为表格，不请求远程图片。
- MD-04：真实历史回复在桌面和 390px 窄屏渲染通过，表格区域独立横向滚动且不撑宽侧栏或页面；保留多轮回复的滚动行为。

验证：先添加失败组件回归，再解析/展示定向测试、AssistantPanel 和 WorkbenchView 回归、typecheck/lint/build；浏览器只读复核截图对应已保存对话、检查桌面/窄屏截图与几何范围；最终 diff 和链接检查。

回滚：撤销本轮前端组件、解析、测试和说明改动；历史原文不改写，无数据迁移。

## Plan

没有已有 Markdown 依赖或展示组件，采用固定 Vue 标签和文本节点渲染明确支持的常用子集。分离块级/行内解析与布局，复用消息气泡样式；表格和代码独立滚动。以用户实际历史表格作浏览器复核。

## Checklist

引用本文件 Spec；前端限定边界、无依赖/接口变化、历史只读及无 HTML 注入已确认。

- [x] MD-01：真实三列表格及两行显示通过，覆盖列对齐、缺省单元格、转义与代码竖线、无效表格回退。
- [x] MD-02：标题、段落、简单列表、引用、强调和代码有展示结构；用户输入和编辑保留原文。
- [x] MD-03：固定 Vue 标签与文本节点，不使用 v-html；HTML、危险链接和图片不执行或加载，围栏代码不解析为表格。
- [x] MD-04：真实历史回复桌面/390px 窄屏浏览器验证通过；表格局部滚动，不撑宽侧栏或页面，模型与会话内容保持不变。

## 验证记录

2026-10-05 实际验证：

- 修复前新增组件回归失败，预期 1 张表格，实际 0 张；原有 14 项通过。日志 `/private/tmp/opm-markdown-failing-test.log`。
- `npm run test --workspace=@opm/web -- src/modules/workbench/AssistantMessageContent.spec.ts src/modules/workbench/AssistantPanel.spec.ts src/modules/workbench/WorkbenchView.spec.ts`：6 + 15 + 92，共 113 项通过。日志 `/private/tmp/opm-markdown-web-test.log`。
- `npm run typecheck`、`npm run lint`、`npm run build --workspace=@opm/web` 通过；最终构建 2.79 秒，保留既有 `/opm-bootstrap.js` 非 module 提示。日志 `/private/tmp/opm-markdown-typecheck.log`、`/private/tmp/opm-markdown-lint.log`、`/private/tmp/opm-markdown-build.log`。
- 真实历史浏览器验证 1 项通过，总计 1.6 秒。只读打开用户原对话，检查“方案/做法/适用”三列及两行、桌面及 390px 侧栏边界、局部横向滚动、输入框可见，前后模型版本与整个会话返回值一致，无页面错误。未重新调用 DeepSeek 或改写历史。日志 `/private/tmp/opm-markdown-e2e.log`。
- 已实际查看桌面、窄屏及单独表格截图，表头背景、行列边框、交替行背景及中文换行正常。窄屏内容不撑宽页面，长代码和表格仍在各自区域滚动。
- 本轮 9 个文件的疑似密钥和本地 Markdown 引用检查通过；`git diff --check` 通过。后台、接口、依赖及数据均未修改，不重复后端或供应商生成测试；原编辑 e2e 只将“身份栏不显示标题文字”的断言限定到消息头，允许正文粗体。

浏览器命令：

```sh
OPM_E2E_EXTERNAL_SERVERS=true \
  OPM_ASSISTANT_MARKDOWN_PROOF=/private/tmp/opm-assistant-markdown-proof.json \
  npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/workbench-assistant-markdown.spec.ts --output=/private/tmp/opm-assistant-markdown-e2e
```

身份文件仅含 projectId/modelId/contextId，来源为原有含表格回复的会话，测试不会发送消息或写模型。输出目录保存 `assistant-markdown-desktop.png`、`assistant-markdown-mobile.png`、`assistant-markdown-table.png`。

## 本轮文件

- `apps/web/src/modules/workbench/assistantMarkdown.ts`
- `apps/web/src/modules/workbench/AssistantMessageContent.vue`
- `apps/web/src/modules/workbench/AssistantMessageContent.spec.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `tests/e2e/workbench-assistant-markdown.spec.ts`
- `tests/e2e/workbench-assistant-message-edit.spec.ts`
- `apps/assistant/README.md`
- `specs/opm-assistant-markdown-task-spec.md`
