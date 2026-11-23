# 空白平移与浏览器原生拖放冲突修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix。
Active Playbooks: frontend-vue (primary), testing。

## 目标与边界

修复画布空白处单次按住拖动被浏览器文字选择、原生 dragstart 和 pointercancel 中断的问题。
允许修改 OpdCanvas、局部画布样式、现有组件浏览器回归、工作台交互文档和组件打包版本；同步平台 vendor 包及对应 package.json/package-lock.json。
禁止修改后端、API/schema、业务 store、现有模型数据和其他页面；不增加依赖，不修改 .harness，保留已有 .idea 内容。
非目标：框选、触摸手势、业务规则或拖线语义调整。契约影响：无，只有绘图区默认鼠标行为及组件补丁版本变化。

## 验收

- A1：存在浏览器文字选区时，选择和平移模式均可连续单次拖动空白；不产生原生拖放或 pointercancel。
- A2：拖动保留 X6 添加的容器 class，保持视口、鼠标样式和内置平移工作正常。
- A3：单击对象、空白取消选择、名称编辑输入框选字保持可用；拖动不修改模型。
- A4：源码检查、定向测试和组件构建通过，平台实际引用的包包含修复。

## Plan

1. 在已有无服务组件示例中增加真实浏览器回归，先复现选区导致的拖动取消。
2. 在绘图区禁用浏览器文字选择及原生拖放；使用独立 data 属性表达拖动态，避免 Vue class 更新覆盖 X6 的运行时 class。保留 X6 鼠标点击链和输入框编辑。
3. 执行定向回归和类型/代码检查；构建补丁包并更新平台本地依赖，再核验平台加载结果。

## Checklist

Spec: specs/opm-blank-pan-native-drag-bugfix-task-spec.md。
边界确认：仅画布前端、对应回归和文档，以及平台引用的组件补丁包；不操作业务模型或数据库。
- [x] A1 连续单次空白拖动
- [x] A2 X6 容器 class 与平移模式
- [x] A3 选择、名称编辑与零业务写入
- [x] A4 构建、检查及平台组件同步

## 验证与回滚

复用 workbench-component 的 Playwright 配置和纯前端示例，避免创建或保存业务模型。真实浏览器负责覆盖原生选区/拖放事件，现有 Vitest 覆盖画布生命周期与名称编辑；不使用 mock 事件代替原生拖放验证。
回滚只撤销本次源码、测试、文档和平台组件引用差异，原 vendor 包保留；无需数据回滚。

## 实际证据（2026-10-20）

- 修复前，新增浏览器用例失败：拖动后容器只剩 opd-canvas，X6 注入的 x6-graph 被响应式 class 覆盖。上一轮浏览器诊断同时捕获了原生 dragstart → pointercancel → lostpointercapture。
- 修复后 workbench-component 两项真实浏览器回归通过：已有文字选区下选择/平移/选择共九次单次拖动均达到预期位移，无 pointercancel；X6 class 保留，原生 dragstart 可取消，对象点击和空白取消选择成功，零 API 请求和页面错误；原有双实例隔离回归通过。
- Vitest：useBlankCanvasPan 四项、OpdCanvas 二十七项，共三十一项通过；覆盖拖动生命周期、名称编辑和原有关系交互。lint、typecheck、组件构建通过。
- 真实源码画布独立验证：双击名称后输入框 selectionStart=0、selectionEnd=12，更新名称并 Enter 后回调收到新名称，编辑关闭且无页面错误；未调用模型服务。
- 平台已安装 vendor/opm-workbench-0.2.2-platform.2.tgz，package.json 和本地忽略的 package-lock.json 同步。平台完整类型检查/生产构建通过，保留既有 Rollup 注释与包体积警告。
- 本地 3000 的 Vite 依赖预构建仍缓存旧包，已核实进程后只重启此前端并强制重新预构建。在平台同源加载实际 @opm/workbench 后重复九次拖动、选择与取消选择验证通过：class=opd-canvas x6-graph，pointercancel=0，API 请求=0，页面错误=0。无需后端重启。
- 平台另外两个 Java 文件出现其他工作中的修改，本任务未编辑；diagram 既有 .idea 目录保留。
