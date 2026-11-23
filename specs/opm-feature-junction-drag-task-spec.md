# 所属三角标记拖动

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: feature.
Active Playbooks: frontend-vue (primary), backend-springboot, testing.

## 目标与边界

对象属性的双三角和过程操作的实心三角可独立拖动，连接同步更新，保存及折叠重开保留位置，支持恢复自动位置、撤销重做。默认固定右侧布局继续兼容旧数据；三角随所属节点平移，语义和现有线段弧度保持。

允许修改 apps/web 画布、布局保存/投影、Runtime 布局段校验、相关测试及使用文档、工作台版本和宿主 vendor 引用。禁止数据库 schema、依赖、接口字段、业务语义及用户模型数据改写。位置复用 owner occurrence 的 Layout.edge_routes：feature.characterization.junction / feature.composition.junction，MANUAL 恰好一个中心点，AUTO 空点；前后端须同时更新。

## 验收与计划

- A1 可拖动两种标记，实时预览主干和分支；只选择不保存，Esc/失焦取消，缩放和平移定位正确。
- A2 手动保存刷新及折叠展开恢复；移动所属节点联动；撤销重做及恢复自动有效，不改已有曲线点。
- A3 只读/布局预览/连线模式禁止编辑，删除标记不误删所属实体。
- A4 Runtime 仅允许种类匹配的 junction 段，校验点数与坐标，真实持久化及回归测试通过。
- A5 构建、打包、更新本地服务，实际宿主只读验证，完整改动和测试清单记录于本文。

顺序：复用所属路径协议 -> 增加标记拖动与取消/恢复 -> 定向回归及隔离浏览器验证 -> 打包更新本地进程。

- [x] 边界已确认，复用既有布局字段且不新增关系事实。
- [x] A1–A4 实现和验证。
- [x] A5 本地更新和交付。

## 实现和验证结果

原标记为按所属节点右侧坐标计算的装饰节点，不接收鼠标拖动，也没有独立位置存储。本次用轻量拖动手柄编辑既有布局段，符号节点仍不进入语义实体集合；预览复用增量所属线绘制，释放单次提交，取消恢复，节点移动时位置及适用的手工弯曲点同步平移。

- A1：新增 `useFeatureJunctionEditor` 及 `feature-junction`，覆盖双三角与实心三角的鼠标拖动、只选中不提交、Esc/失焦/取消指针恢复、缩放和平移坐标。默认朝向与右侧位置兼容旧数据。
- A2：沿用 UPDATE_LAYOUT_BATCH、edge_routes、草稿保存和历史流程；标记段与根/分支弯曲点独立。测试保存失败重试、投影覆盖、撤销重做、owner 平移及恢复自动。
- A3：可编辑判断排除只读、布局预览、平移及连线模式；标记选择清空实体选择，Delete/Backspace 不删除所属实体。
- A4：Runtime 校验对应 ELEMENT core kind，只允许所属种类匹配的 junction 段；MANUAL 一个点、AUTO 零个点，坐标沿用有限数校验；FEATURE、STATE 及错误种类拒绝。真实 PostgreSQL 隔离 schema 的重开、投影、跨图隔离、语义不变、非法点数、自动恢复测试通过。
- 定向前端回归：21 个文件、148 项全部通过（含新手势 6 项、增量标记两种形状、移动预览、布局历史及原有普通曲线测试）；ESLint 零警告，工作台类型检查、声明生成和构建通过。
- 定向后端：DraftWorkspaceControllerTest 的所属路径、普通关系路径、批量原子性和非法几何 4 项，以及 SemanticLayoutEditorTest 2 项，共 6 项通过，Maven package 成功。
- `verify-feature-owner-routes.mjs` 通过真实浏览器：普通所属线弧度回归、两种标记拖动、实时分支变化、Esc 取消、保存重载、折叠重开、恢复自动、缩放/平移后操作、owner 平移和撤销、三角符号保留、只读及 Delete 防误删。脚本保存边界为隔离 sessionStorage；真实数据库持久化由上述后端测试覆盖。
- 本地宿主安装 `0.2.2-platform.18`，前端 3000 和 Runtime 17850 已更新重启，Runtime health 为 UP。主题 31 实际页面标记可选择且显示恢复按钮，紫色属性及双三角保留，无 pageerror、模型写入请求为 0。截图：`D:/work/本体论/logs/feature-junction-host.png`。
- 两仓 diff whitespace 检查通过，无 SQL 迁移或新依赖。尚未部署 K8s；上线需同时更新 Runtime 和工作台包。

## 本次文件清单

opm-diagram：

- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/opd/useFeatureJunctionEditor.ts`
- `apps/web/src/modules/workbench/opd/useFeatureJunctionEditor.spec.ts`
- `apps/web/src/modules/workbench/opd/core/feature-junction.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.spec.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-movement.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-movement.spec.ts`
- `apps/web/src/stores/workbench/featureOwnerLayout.ts`
- `apps/web/src/stores/workbench/workbenchLayout.ts`
- `apps/web/src/stores/workbench/relationLayout.spec.ts`
- `apps/web/scripts/verify-feature-owner-routes.mjs`
- `apps/web/scripts/package-workbench.mjs`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `docs/integration/opm-workbench-user-guide.md`
- `specs/opm-feature-junction-drag-task-spec.md`

opm-platform：

- `apps/web-console/package.json`
- `apps/web-console/vendor/opm-workbench-0.2.2-platform.18.tgz`

宿主 ignored package-lock 与 node_modules 随离线安装更新。保留既有配色、曲线、用户 .idea 和旧 vendor 包；本地 jar 及日志不纳入源码。

## 回滚

优先保留新版 Runtime 并恢复工作台 platform.17，旧前端不展示手工三角位置。如必须回滚 Runtime，先通过受控布局命令移除本次新增的 junction 段并保留其余布局，确认没有新段后再回滚；单纯“恢复自动位置”仍保留 AUTO 段，不能代替此步骤。无需 SQL 迁移。
