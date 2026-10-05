# 连线选中反馈

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: frontend-vue (primary), testing。

## Spec

目标：画布关系被选中时有明确反馈，支持普通连线、带控制字母的连线、Effect多段关系与结构扇形；点击关系装饰也选择所属关系。取消/切换选择、只读、缩放和属性操作均保持正确。
非目标：新增连线编辑手柄、连线多选、修改工具栏、路由或OPM符号语义。
允许：OpdCanvas、内部relation-render-spec/x6-relation-adapter及对应测试、独立E2E、本规格和页面说明。禁止：API/schema/持久数据、store业务、依赖/配置、.harness、案例原数据、无关重构。内部render spec增加可选视图选择态，不改变公共契约。
复现：用户报告点击关系无变化；edge:click已发出select，OpdCanvas监视selectedId但生成relation spec时没有传递选择态；adapter固定使用黑色与原线宽。旧测试只验证节点选中及关系点击事件，没有核验关系的实际选中外观。

- A1：选择关系时整组线段、箭头/圆点/三角及文字使用蓝色，线条加粗；空心、白色遮罩、透明背景、形状/方向/位置保持原语义。取消或选别的元素精确恢复普通外观。
- A2：同一关系任一线段或结构装饰可选中整组；右键保留关系操作；不会选中装饰伪ID。关系选择沿用选择工具与交互阶段守卫。
- A3：选中态仅视图内存，无语义、布局、保存写入，不清空/重建画布；只读可选中，预览与Finding数据保持原有含义。
- A4：组件/adapter定向回归、真实画布创建并选择代表关系、选择切换/取消、控制标记、多段关系、历史只读、缩放及桌面/窄屏截图核验；typecheck/lint/diff通过。仅清理新测试模型到回收站。

验证：Vitest验证还原/符号语义/增量更新，Playwright验证真实点击与截图、token及写入次数。
回滚：仅撤销本轮视图及测试说明增量，无数据迁移。

## Plan

1. 在完成路由的渲染spec附加选择标记；X6 adapter统一应用完整关系组视觉并从原spec还原。
2. 装饰点击通过现有关系组cell映射找到所属语义关系；不影响建模元素与绘制手势。
3. 运行定向测试和实际画布回归，检查截图、记录验收。

## Checklist

引用：specs/opm-relation-selection-bugfix-task-spec.md；边界已确认，禁止公共契约/持久数据修改。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

## 验收记录

- 定向 Vitest：OpdCanvas 23 项、x6-relation-adapter 6 项、relation-preview-renderer 3 项，共 32 项通过。覆盖选中/还原、整组更新、装饰归属、交互守卫、只读、空心/实心语义和 Finding 保留。日志：`/private/tmp/opm-relation-selection-unit.log`。
- typecheck、lint 通过，日志：`/private/tmp/opm-relation-selection-typecheck.log`、`/private/tmp/opm-relation-selection-lint.log`。
- Playwright 在实际画布创建元素和关系，六个场景分批通过：消耗事件、主体实心圆、手段空心圆、Effect 双线段、聚合实心三角、泛化空心三角。前四项见 `/private/tmp/opm-relation-selection-final.log`；该批结构场景受测试关闭菜单点击位置遮挡影响，修正测试点击位置后，两项结构场景通过，见 `/private/tmp/opm-relation-selection-fan.log`。
- 实测分支/三角点击与右键、取消/改选、缩放、历史只读；选择过程中编辑序号不变，监听到的草稿命令/保存/固定版本写请求为 0，页面异常为 0。各场景新建的测试模型均移入回收站，原有案例未修改。
- 已查看上述两个 E2E 输出目录中各场景的桌面截图及代表场景的窄屏截图：整组蓝色加粗，空心/实心标记区别保留，无溢出。截图文件为各场景目录下的 `selected-desktop.png`、`selected-mobile.png`。
