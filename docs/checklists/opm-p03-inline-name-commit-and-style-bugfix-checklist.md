# 节点名称输入修复 Checklist

规格：`specs/opm-p03-inline-name-commit-and-style-bugfix-task-spec.md`。

- [x] 边界已确认：前端交互/局部CSS/测试与文档；独立测试库，保留用户数据。
- [x] N01
- [x] N02
- [x] N03
- [x] N04

## 2026-09-14 实际结果

- 最小复现：先新增“改名失焦提交一次，失败保留输入”用例，修改实现前结果为1失败/11通过，submitNameEdit调用次数为0，印证旧blur关闭丢弃用户输入。日志 `/private/tmp/opm-inline-name-before.log`。
- 组件：OpdCanvas 14/14，WorkbenchView 74/74。覆盖Enter/blur/同名/Escape/失败焦点、IME最终值、重复提交、保存入口等待、目标切换与卸载。IME用例使用compositionstart→input→blur→compositionend真实事件顺序；不使用会额外派发change的setValue模拟组词，避免测试提前结束Vue原生composing状态。
- 隔离E2E：`OPM_E2E_EXTERNAL_SERVERS=true npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/workbench-inline-name.spec.ts --reporter=line`，1/1通过。真实打包Runtime17851、Vite5176、SQLite位于 `/private/tmp/opm-inline-name-test-kEMQVf`。从UI新建Object/Process及Consumption关系；中文Enter/画布失焦提交、OPL更新、无变化零编辑、Escape、非法名称保留、保存按钮完成输入和刷新恢复全部通过。没有写当前runtime-data用户模型。
- 浏览器computed style：borderTopWidth=0px、outlineStyle=none、boxShadow=none；100%对象、110%过程截图目视确认没有双框，文字居中，过程输入没有遮挡椭圆边界。证据位于 `test-results/workbench-inline-name-中文节点改名支持Enter和点击画布提交，保持OPL、刷新与无边框样式一致/{object-editing.png,process-editing-zoom.png}`。原生中文输入法事件由组件模拟验证，未声称真实操作系统IME测试。
- `npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web`、Node22下 `npm run build --workspace=@opm/web`、`git diff --check`通过。build的bootstrap经典script不打包提示符合既有运行时下发设计。未生成vite.config.d.ts。无后端改动，不重复后端单测或重启用户服务。

本包8项：本checklist、同名spec、原element-name-editing规格、组件交互设计、OpdCanvas.vue/OpdCanvas.spec.ts、base.css局部编辑框规则、workbench-inline-name.spec.ts。当前目录开发，保留全部前序差异，不创建worktree、不提交。

收尾：已正常终止本轮临时Runtime19793/Vite19852；用户Runtime96920/Vite96969保留。提升至允许本机网络的只读终验确认17850 health=UP、5173项目页/API代理/bootstrap均200，实际Vite模块包含新的composition/blur处理及无边框focus-visible规则。用户刷新页面即可使用。
