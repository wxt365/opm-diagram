# 画布滚轮缩放

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: frontend-vue (primary), testing。

## Spec

目标：在画布内直接用滚轮向上放大、向下缩小，以鼠标位置为中心；选择和平移工具、只读历史均可用，工具栏比例同步实际SVG比例。
非目标：视口持久化、触屏手势自定义、模型/布局修改及快捷键重构。
允许：OpdCanvas及既有组件测试、当前视口提示、定向浏览器测试、页面设计文档与本规格。禁止：后端、公共API/schema、配置、依赖、store语义规则、.harness、原案例数据以及其他无关变更。
契约影响：无数据/API影响；平移工具原滚轮平移改为滚轮缩放，鼠标拖动仍平移。
- A1：画布滚轮无需修饰键、向上放大向下缩小，鼠标锚点保持，比例范围沿用0.01%–400%，同步工具栏。
- A2：选择/平移/只读均支持；滚轮退出适应模式；名称编辑框、侧栏和画布外滚动不缩放画布；按住鼠标拖动时不滚轮缩放。
- A3：滚轮不产生commands/save/pin或修改元素坐标；缩放后可选择、移动元素，适应/恢复100%/工具栏缩放继续有效。
- A4：定向组件和真实画布（隔离模型）验证、typecheck/lint/diff通过。
验证：复用X6已安装2.18.1原生MouseWheel（局部事件、鼠标锚点、缩放限制和释放），真实浏览器覆盖方向/锚点/边界/只读/平移及元素操作。回滚本次前端增量即可。

## Plan

1. 启用原生mousewheel，限制拖动/输入目标和无垂直量事件；移除panning mouseWheel以避免同一事件平移和缩放。
2. 在scale事件同步工具栏，保留viewport退出适应及编辑框定位机制；增加缩放提示。
3. 实际画布验证后记录结果。

## Checklist

Spec: specs/opm-wheel-zoom-feature-task-spec.md。允许/禁止及兼容边界已确认，无依赖和持久化变更。
- [x] A1
- [x] A2
- [x] A3
- [x] A4


## 实际验证（2026-10-02）

- A1/A2/A3：真实前后端浏览器 `workbench-wheel-zoom.spec.ts`、`workbench-blank-pan.spec.ts` 共2项通过。检查滚轮方向、鼠标锚点不偏移、比例与SVG矩阵同步、400%/0.01%边界、滚轮退出适应模式后resize不覆盖比例、选择和平移工具、只读历史、画布外及输入框不缩放、按住拖动时滚轮拦截。实际滚轮不改变节点transform或草稿序号、无commands/save/pin；缩放后节点可选择且拖动成功，工具栏放大/恢复/适应操作正常。
- A4：OpdCanvas、canvas-viewport、WorkbenchView定向组件/规则测试113项通过；typecheck、lint、git diff --check通过。桌面截图已人工查看，缩放百分比与实际元素渲染一致。
- 第一次运行的旧panning断言仍要求mouseWheel，已同步新契约。实际浏览器WheelEvent.buttons不反映拖动按下，改用原生pointerdown及window pointerup/pointercancel/blur追踪，避免拖动途中缩放。只读新SVG未指定transform时合法单位矩阵由测试辅助函数识别。
- 隔离模型测试后移入回收站，原案例未修改。证据 `/private/tmp/opm-wheel-e2e` 与 `/private/tmp/opm-wheel-*.log`。
