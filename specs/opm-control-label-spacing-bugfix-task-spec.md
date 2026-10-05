# 控制关系字母与端点间距修正

## 执行信息

- Work Mode：change；Risk Level：L2；Task Type：bugfix。
- Active Playbooks：frontend-vue（primary）、testing。

## 目标与边界

用户截图中 `e`、`c` 与箭头、圆点贴近或重叠。调整控制关系文字定位，使短线、水平、垂直、斜线和缩放后的文字均能与端点符号区分。

允许修改控制装饰的前端定位逻辑、相关回归测试和本规格。禁止修改 API、schema、后端、依赖、配置、控制关系语义及持久化内容；禁止修改用户演示模型。非目标：通用标签自动避让、元素布局和工具栏重设计。

本次仅涉及内部渲染值，不影响公共契约。已有未提交的模型回收站相关工作保留。

## 复现与原因

2026-10-01 在运行中的 5177 前端只读打开“仓储订单履约-工具校验-CTRL”，复现用户第二张截图中水平主体事件字母覆盖圆点、消耗事件贴近箭头。实际最短路径为 30px，旧规则距目标仅 3.6px。新增画布用例在修改前测得 44px 路径的字母背景侵入标记保留区 9.35px，间距断言失败。`createControlDecorator` 固定使用 `position: 0.88`，距目标为线长的 12%，没有计入 10px 端点符号及字母背景尺寸。既有 registry/adapter/preview 测试验证了字母、标记和关系身份，未验证实际 SVG 几何间距，因此遗漏短线问题。

## 验收

- A1：`e`、`c` 与箭头、实心/空心圆之间有可见留白，短线也不会被字母背景盖住端点。
- A2：水平双向、垂直双向和斜向连线，以及 80%、100%、150% 缩放保持间距；节点移动后定位仍有效。
- A3：预览、提交、保存重开采用一致定位，控制字母、基础符号、关系身份和 OPL 语义正确。
- A4：真实画布创建元素、创建基础关系并附加控制关系，使用实际 SVG 几何断言并查看截图；既有相关单元测试、类型检查、lint、构建通过。

## Plan

1. 使用 X6 已支持的负数绝对距离，从目标沿路径回退 24 个画布单位放置字母中心，容纳 10px 标记、字母背景半径和可见空隙；避免在 30px 短线中退到源对象上，不扩大内部类型或引入依赖。
2. 在真实画布交互测试中覆盖短线、各方向、缩放、拖动和保存重开，检查字母背景与端点的投影间距，保留失败到通过的证据。
3. 执行定向自动化、质量检查及截图检查，清理本轮创建的验证模型。

## Checklist

- [x] 边界确认：仅上述前端逻辑、测试、`specs/opm-control-label-spacing-bugfix-task-spec.md`；禁止范围已确认。
- [x] A1、A2：真实画布几何与截图。
- [x] A3：控制预览、提交、保存重开。
- [x] A4：画布操作、回归与质量检查。

## 验证记录

2026-10-01 实际执行：

- A1–A4：`OPM_E2E_EXTERNAL_SERVERS=true OPM_CONTROL_SPACING_BASE=http://127.0.0.1:5177 OPM_CONTROL_SPACING_PROJECT=project.9ae0e3dd46ae4f3a8b45520c5057ecd7 npx playwright test tests/e2e/workbench-control-label-spacing.spec.ts --config=tests/e2e/playwright.config.ts --reporter=line --max-failures=1`：4/4 通过，17.0 秒。真实鼠标新建对象、过程、状态，拖线建立关系、预览/提交控制字母、移动节点、切换 80%/150%/100%、保存重开；检查沿端点切线扣除含描边标记保留区后的留白 ≥4 个画布单位，重开后字母及 OPL 相同。截图位于 `test-results/workbench-control-label-spacing-*/control-spacing-canvas.png`，已查看手段条件斜向截图。
- 只读检查原控制演示模型的 8 条带注记线：100% 缩放下实际保守留白为 5.21–9.37px，包括 30px 短线。修正后截图 `/private/tmp/opm-control-after.png`，几何记录 `/private/tmp/opm-control-after-geometry.json`，已查看截图。
- 定向 Vitest：registry、adapter、preview、RelationToolSymbol、OpdCanvas，5 个文件 47/47 通过。
- `npm run lint`、`npm run typecheck`、`npm run build --workspace=@opm/web`、`git diff --check`：全部退出 0。构建仍提示既有 `/opm-bootstrap.js` 非 module 脚本，构建成功；本次未改启动配置。
- 回归交互脚本首次使用 DOM 点击命中 X6 不可交互的 line 路径而超时，随后改为通过路径坐标执行真实鼠标点击，再获得上述有效红/绿间距断言。所有回归新建模型在 finally 中清理；首次超时遗留模型也按精确名称清理，未修改用户演示模型。

Node 使用仓库已有的 Node 22.22.0；测试复用运行中的前后端，无后端修改。

## 回滚

只撤销本轮控制字母定位和新增测试，保留其他未提交工作及用户模型；无需数据迁移。
