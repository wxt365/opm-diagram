# 属性及操作所属连线编辑修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: bugfix.
Active Playbooks: frontend-vue (primary), backend-springboot, testing.

## 目标与边界

对象到属性、过程到操作的所属线支持选中、调整路径、保存、刷新恢复和恢复自动。保留 characterization 双三角和 composition 实心三角，以及原有属性折叠、所属语义和节点颜色。

允许修改 opm-diagram 的画布、节点布局映射/历史/移动、Runtime 布局校验、对应测试与使用文档、工作台包版本，以及宿主 opm-platform/apps/web-console 的 vendor 包与引用。禁止修改数据库 schema、新增接口/依赖、创建虚构关系事实或改写用户模型数据。

复用现有 Layout.edge_routes：主干路径存所属元素 occurrence 的 feature.characterization / feature.composition 段；分支路径存特征 occurrence 的 feature.owner 段。无需迁移，空字段仍兼容旧数据。后端只放行与目标种类匹配的所属段，普通关系规则保持。部署需要同时更新 Runtime 和前端，旧 Runtime 会拒绝非 FACT 路径。

## 验收

- A1 属性主干、分支及操作所属线可选中编辑，标记保留，选择不产生布局修改。
- A2 拖动实时预览、保存及重载恢复、恢复自动；折叠再展开不丢手工路径。
- A3 通过既有批量布局/草稿保存链路，支持撤销重做及失败重试；移动节点不丢路径，整组平移时路径跟随。
- A4 取消手势、只读、预览、切换选择兼容；线的选择不误删除对象/属性。
- A5 Runtime 允许匹配的所属段，拒绝错误种类/重复段/状态路径，跨 occurrence 隔离且不改变业务语义。
- A6 定向前后端测试、类型检查、构建、真实浏览器验证通过，更新宿主包并启动最新本地服务。

## 计划与 Checklist

1. 将自动所属线附上所属 occurrence/segment 元信息，复用路径编辑器。
2. 补齐节点 edge_routes 投影、保存、历史和平移，扩展后端匹配段校验。
3. 测试隔离模型的完整交互和持久化；更新工作台包及本地进程，宿主只做非写入检查。

- [x] 边界确认：既有布局字段，无数据库迁移或新增关系事实。
- [x] A1–A5 实现及定向验证。
- [x] A6 构建及真实运行验证。

## 实现与验证结果

根因：所属线原来由 ownerId 自动派生为不可交互的装饰线，没有进入关系路径编辑器；节点布局投影和保存也没有携带所属路径，Runtime 仅允许 FACT 保存 edge_routes。既有普通关系测试未覆盖这种装饰线。

修复：所属线附上真实 occurrence 和线段标识，复用既有路径编辑、批量布局、撤销重做及保存流程，不创建新的关系事实。主干与各分支独立保存；对象/过程整组移动时保留并平移适用路径，单端移动不丢路径。Runtime 按节点种类校验线段，节点普通移动和状态容器调整保留已有路径。

- 前端定向测试：`vitest run` 覆盖 opd/core、弧度手柄、OpdCanvas、AutoLayoutPreviewBar、relationLayout、autoLayout、layoutSelection、layoutArrangement、stateLayout 和 projectionMapping，20 个文件、137 项全部通过。
- 后端：`DraftWorkspaceControllerTest` 的所属路径、普通关系路径、批量原子性及非法几何 4 项，加 `SemanticLayoutEditorTest` 2 项，共 6 项通过；真实 PostgreSQL 使用隔离测试 schema，无业务模型写入；Maven package 成功。
- `vue-tsc -p tsconfig.workbench.json --noEmit`、修改文件的 ESLint 零警告、工作台构建及声明类型生成通过。
- `verify-feature-owner-routes.mjs` 通过真实 Vue/X6 与实际布局 store 的鼠标验证：属性分支拖动、保存重载、折叠重开、恢复自动、主干及操作所属线拖动、三角保留、只读及 Delete 防误删。浏览器用隔离会话模拟保存边界；真实后端持久化由上述 PostgreSQL 测试覆盖。
- 原普通曲线浏览器验证 `verify-curve-handle.mjs`、`verify-bezier-canvas.mjs` 通过。
- 工作台 `0.2.2-platform.17` 已打包、离线安装至宿主，本地 Runtime 17850 与前端 3000 已更新重启，两个健康请求均 HTTP 200。宿主主题 31 中属性主干、属性分支和普通关系各显示拖动手柄，属性紫色及三角标记保留，无 pageerror；宿主只选择、不拖动或保存用户模型，记录到的模型写入请求为 0。
- 两仓 whitespace 检查通过。没有数据库迁移；K8s 环境尚未部署，发布时须同时更新工作台包与 Runtime。

## 本次文件清单

opm-diagram：

- `apps/web/scripts/package-workbench.mjs`
- `apps/web/scripts/verify-feature-owner-routes.mjs`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.spec.ts`
- `apps/web/src/modules/workbench/opd/useRelationRouteEditor.ts`
- `apps/web/src/shared/types/modeling.ts`
- `apps/web/src/stores/workbench/layoutSelection.ts`
- `apps/web/src/stores/workbench/projectionMapping.ts`
- `apps/web/src/stores/workbench/projectionMapping.spec.ts`
- `apps/web/src/stores/workbench/relationLayout.ts`
- `apps/web/src/stores/workbench/relationLayout.spec.ts`
- `apps/web/src/stores/workbench/featureOwnerLayout.ts`
- `apps/web/src/stores/workbench/workbenchLayout.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/SemanticLayoutEditorTest.java`
- `docs/integration/opm-workbench-user-guide.md`
- `specs/opm-feature-owner-route-task-spec.md`

opm-platform：

- `apps/web-console/package.json`
- `apps/web-console/vendor/opm-workbench-0.2.2-platform.17.tgz`

宿主 ignored package-lock.json 和 node_modules 随离线安装更新。保留前轮改动、旧 vendor 包和用户 .idea；本地部署 jar 与日志不纳入源码。

## 回滚

宿主包恢复 platform.16，并回退本次交互及 Runtime 校验改动。新保存的路径仍使用既有 JSON 字段，旧前端只是不展示所属线手工路径；不删除用户数据。
