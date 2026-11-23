# 共享脑图编辑器验证

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

2026-11-20；[规格](../specs/shared-mindmap-editor-spec.md)；分支 `codex/harness-0-2-2-rc5`。没有提交、发布或生成客户端安装包。

## 结果与结构

OPM MindmapPanel 与业务 BusinessAnalysisPanel 均直接使用 `shared/mindmap/MindmapEditor.vue`。该组件统一顶部工具栏、文件入口、节点和连线、搜索、滚轮平移缩放、百分比预设、全屏、右侧栏开关、基础名称／说明字段及键盘事件。两者使用 `mindmapTree.ts` 的布局和子树遍历；原领域布局函数作为兼容入口保留。

领域面板仅保留生成／持久操作及语义扩展：OPM 的类型、状态归属、实体复用、现有模型绑定、关系说明与排除检查通过插槽呈现；业务自由文本树不添加正式类型字段。节点详情和生成区保持独立。OPM 工作台移除切换脑图时独有的自动 fit，两者都以100%开始，避免进入后文字自动缩小；用户仍可手动适应全图。

公共组件不依赖业务模块，不访问持久层。仍使用原 useMindmap／useBusinessAnalysis；API、schema、现有数据、导入格式、转换范围与模型确认机制不变。业务保存结果未知时继续允许重试原保存，其他写操作禁用；公共组件使用独立的 saveBlocked 处理该恢复能力。

## 验证证据

| 验证 | 实际结果 |
| --- | --- |
| 定向回归 | 两个领域面板原21项加7项共享交互测试，共28项通过 |
| 关联回归 | `modules/workbench`、`modules/business`、`shared/mindmap`、`shared/workbench`、`workbench`，92文件、766项通过 |
| Web 构建 | `npm run build --workspace @opm/web` 通过，包含 vue-tsc；保留既有 chunk 大于500kB提示 |
| 独立工作台 | `npm run build:workbench --workspace @opm/web` 通过，包含独立TS检查和本地库产物生成；没有安装或发布 |
| lint | 共享目录、两个面板、布局入口及修改的业务面板测试定向 ESLint，0错误、0警告 |
| 边界 | git diff --check 通过；任务前脏状态中的路径没有消失，无后端／依赖／schema修改 |

新增测试覆盖快捷键、中文输入／表单隔离、只读及迟到删除确认、拖动拒绝根节点和后代、折叠搜索适配事件、文档切换、侧栏恢复、滚轮中心、手工百分比和400%预设。既有回归覆盖状态归属和实体引用保护、未分类／属性／关系排除、导入身份重建、保存冲突和幂等重试、历史恢复、转换事件及正式工作台隔离。

开发中类型检查发现生成记录对可空业务文档的访问，已修正。定向回归发现业务 unconfirmed 状态需允许保存重试，因此将编辑锁与保存禁用分别传入；保留原幂等重试用例。业务旧测试的按钮名称和节点定位更新为统一入口，原行为断言保留。未为统一体验修改存储契约。

## 真实浏览器

使用常用前端5180和Java／SQLite17870的隔离项目“自由脑图验收1120”，没有启动外部模型请求：

- 业务模型 `business.model.75e6ef0d50a543b79fd1f4c05fdce251`：Tab新增“共享脑图交互验收”，填写说明并保存；刷新后名称和说明保留，正式模型仍修订2。折叠后搜索能重新展开并定位，125%手动缩放、侧栏隐藏后F2恢复均可用。
- OPM模型 `model.1cbba7da36dc48c8922e5e4fbd14b307`：Tab新增“共享脑图OPM验收”，从未分类改为对象，说明保存后刷新保留；对象分类、实体复用和现有模型绑定入口仍可用，正式模型仍编辑序号1。全屏进入／退出正常，最终100%起始与业务一致。
- 两者工具栏、节点样式、名称／说明与生成区使用同一组件。截图：`/private/tmp/shared-mindmap-business.jpg`、`/private/tmp/shared-mindmap-opm.jpg`。

浏览器验证编辑、保存、重开和视口；未点击正式转换或确认，不宣称重新验证大模型生成质量或正式模型编译。本轮只读和生成锁通过组件测试验证；没有修改用户当前业务模型或原会话。

命令日志在 `/private/tmp/shared-mindmap-{panels,regression,build,library,lint}.log`。这些为本机临时证据，不作为历史交付资产加入Git。

## 文件与回滚

新增共享目录 `apps/web/src/shared/mindmap/`（编辑器、树工具及测试）；修改两个领域脑图面板、两份原布局入口、业务面板测试，以及 WorkbenchSurface 中单一自动 fit 调用；新增本规格和报告。

六个已有文件的任务前副本及脏状态在 `/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-shared-mindmap-_15vn7bt`，WorkbenchSurface 的唯一修改可单独撤销。回滚只恢复本轮差异，不覆盖此前未提交内容，不回滚模型修订或删除分析资料。

## 2026-11-21 功能验收

[共用脑图编辑与交换规格](../specs/shared-mindmap-workflow-spec.md) · [全屏助手规格](../specs/mindmap-fullscreen-assistant-spec.md) · [小地图规格](../specs/shared-mindmap-minimap-spec.md) · [XMind 导入规格](../specs/shared-mindmap-xmind-import-spec.md) · [XMind 导出规格](../specs/shared-mindmap-xmind-export-spec.md)

| 验收项 | 结果 |
| --- | --- |
| 共用编辑与交换 | 前序 Chromium 运行在两个建模入口验证了大纲、原地改名、排序、搜索、分支聚焦、Markdown 导入、SVG／PNG 导出及关联线保存重开。 |
| 脑图全屏助手 | 前序 Chromium 运行验证了底栏隐显、悬浮助手拖动和宽高调整，以及收起再打开时保留位置和未发送输入。 |
| 小地图 | 本次在隔离 SQLite 项目中复测两个入口，点击跳转、拖动视口框、键盘平移、缩放联动和窄屏全屏通过。 |
| XMind 导入 | 前序 Chromium 运行验证了新版和旧版文件、工作表切换、取消、撤销重做和保存重开。本次两个入口均可预览 XMind 客户端自带的 5 主题和 86 主题示例。 |
| XMind 导出 | 本次从聚焦分支的画布下载，业务脑图导出 9 个主题，OPM 脑图导出 14 个主题。两份文件通过独立 ZIP CRC 校验并可在平台重新预览，文件内的中文纯文本备注也已核对。 |
| XMind 桌面打开 | 用户提供的两张截图显示两个文件均能打开，主题数量、标题和父子层级可见，部分节点显示备注图标。桌面截图覆盖打开与呈现，备注正文核对来自文件内容。 |

Web 全量回归 120 个文件、1052 项测试通过。Web 类型检查和相关文件的 ESLint 检查通过。业务分析 SQLite 回归 5 项、业务助手相关回归 19 项通过。当前验收覆盖本地编辑和文件交换，助手回归使用测试替身。

本次浏览器复测使用前端 `5182` 和隔离 SQLite 后端 `17872`。本次收口仅更新此验收记录。若需回滚本次记录，删除本节即可。
