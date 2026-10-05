# 属性名称与工具提示验证

规格：`specs/opm-p03-inspector-name-and-transformation-hint-bugfix-task-spec.md`。

- [x] 允许/禁止范围及截图Object语义已确认。
- [x] IP01
- [x] IP02
- [x] IP03
- [x] IP04

## 2026-09-14 实际结果

- 修改前先添加右侧名称编辑及提示断言，WorkbenchView为2失败/73通过：名称行不可编辑且过时P0提示仍存在，Tooltip仍是旧混排字符串。日志 `/private/tmp/opm-inspector-before.log`。
- 修复后 `npm run test --workspace=@opm/web -- src/modules/workbench/ElementNameProperty.spec.ts src/modules/workbench/WorkbenchView.spec.ts`：79/79。包含Runtime授权/封闭命令/回读、同名零命令、失败保留和焦点、Escape、只读、IME最终输入、保存等待及卸载后不抢焦点。
- `OPM_E2E_EXTERNAL_SERVERS=true npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/workbench-inline-name.spec.ts --reporter=line`：1/1。真实临时SQLite（`/private/tmp/opm-inspector-test-QJwlK3`）、Runtime17851、Vite5176、Chromium。有真实Consumption连线的模型通过右侧Object/Process名称修改、OPL同步、无效输入保留、Escape、Ctrl+S与刷新重开；常驻/展开组合工具精确三行提示相同。保留前轮双击名称/无边框回归。
- `npm run typecheck --workspace=@opm/web`、Node22 `npm run build --workspace=@opm/web`、`git diff --check`通过；lint初次发现新增模板换行风格警告，按仓库风格局部调整后 `npm run lint --workspace=@opm/web` 通过。仅格式修正，没有扩大实现范围或重复无关测试。
- 截图 `test-results/workbench-inline-name-中文节点改名支持Enter和点击画布提交，保持OPL、刷新与无边框样式一致/inspector-name.png` 经目视检查：右侧单层输入框、ID/Occurrence只读、无旧P0提示，OPL与图元名称一致。原生IME以组件事件序列验证，未声称OS级IME验收。

完整10项：本checklist、同名spec、组合工具spec、组件交互设计、ElementNameProperty.vue及spec.ts、WorkbenchView.vue及spec.ts、transformation-tool.ts、workbench-inline-name.spec.ts。没有修改公共契约、后端、Profile或用户模型，没有创建worktree/提交。
