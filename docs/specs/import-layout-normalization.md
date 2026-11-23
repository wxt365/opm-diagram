# 导入布局归一与模型可读性修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L3；Task Type: bugfix。
Active Playbooks: frontend-vue (primary)、backend-springboot、testing（沿用相邻平台仓库规范）。

## 目标与边界

所有新建导入工作区的总图和子图在入库前完成几何检查；已有模型可显式预览、整理当前图或全模型。正常包含与独立节点碰撞分别处理，保持语义、端点、图层级、颜色及备注。算法不得依赖业务名称、固定 ID 或指定文件。

允许修改 diagram 的导入初始化、布局、状态容纳、细化包络、连线、相关测试和文档，以及打包脚本；允许更新 platform 工作台包引用与 vendor 包。复用现有 API、草稿 token、批量布局授权与保存流程；不改数据库 schema、不加依赖、不改发布语义、不改历史快照、不清空业务数据。已有未提交修改全部保留。

## 计划与验收

- IMPORT：在 runtime 统一模型初始化处遍历每个 Context，先规范尺寸和所属组，再消除独立节点碰撞；合理原坐标保留，严重重叠重新分层；修复折点只限受影响图。布局入库后首次打开即可使用，无浏览写入。
- GEOMETRY：布局与渲染使用一致尺寸；长名称留足空间，状态在 owner 内排列，属性子树预留完整空间；碰撞复核覆盖不同 occurrence，容器和所属状态不误报。
- READABILITY：按关系语义优先主流程，循环和孤立节点均衡分区；优化包络空白；普通和调用关系分道，保留关系符号及手工操作。
- MODEL：当前图沿用预览/应用/撤销；全模型整理先只读获取各图投影并计算预览，应用时沿用每图授权与 token 串行批量编辑，明确显示进度和部分失败。应用到草稿后需手动保存，支持撤销；只读历史不开放整理。
- EDIT：新增对象/过程寻找邻近空位，属性及状态扩容后局部消碰撞；不在拖动帧内做全图重排。
- SAVE：加载/切图不擅自重排或变脏；保存重开恢复；重复计算稳定，同一文件每张图的语义节点及关系不增不减。
- VERIFY：先补纯算法和导入初始化回归，覆盖多图、长名称、多状态、属性子树、分支、循环、固定参考与手工路径；执行前端定向测试、类型检查、lint、Java 定向回归及打包；浏览器验证真实模型所有子图和新导入工作区。

边界已确认。先补定向回归，再实现 runtime 入库修复、前端整理及局部防碰撞，最后打包并重启受影响本地服务。

## 回滚

仅回退本轮新增实现和调用、包版本引用；不撤销先前功能或未提交修改。新导入几何可由原始文件重新生成，现有模型只有显式应用整理才改变草稿，不覆盖历史。

## 实现说明与原因

此前自动整理只覆盖当前图，模型导入初始化没有逐 Context 复核几何；状态扩容和长名称尺寸也没有始终参与独立节点避让。原有验证集中在当前图，未覆盖一个包内大量子图的首次打开与持久化。这次在统一导入初始化处修复，已有模型通过显式全模型预览整理，保持历史快照不变。

全模型布局优先采用过程调用及“过程产出对象、下一过程使用对象”的语义次序，避免共享状态的反馈把主线挤在一层。属性子树作为完整组预留空间，状态保持容器内排列；固定引用作为障碍。导入阶段的固定引用重叠若无法消除，会返回明确的校验错误。连线仍沿用正交避障、原关系标记及手动调整能力。

X6 增量移动和缩放节点不一定触发 `render:done`。视口现监听实际 SVG 内容更新后重新适应，并跳过未变化的缩放和平移，解决全模型预览切图时沿用旧边界造成的裁剪。

已有模型操作入口：布局工具 → 整理整个模型 → 选择方向、逐图预览 → 应用到全部图 → 保存草稿。应用按现有每图授权串行执行，支持进度提示、部分成功后的撤销、部分撤销失败后的继续撤销。应用期间阻止编辑，预览不会写入草稿。大模型处理时间随图数增加；复杂多对多关系仍可能交叉，不承诺所有图均无交叉线。

## 涉及文件

后端：
- `services/local-runtime/src/main/java/org/opm/localruntime/application/ImportedLayoutNormalizer.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalCatalogService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/ImportedLayoutNormalizerTest.java`

布局与编辑：
- `apps/web/src/stores/workbench/autoLayout.ts`、`autoLayout.spec.ts`
- `apps/web/src/stores/workbench/modelLayout.ts`、`modelLayout.spec.ts`
- `apps/web/src/stores/workbench/ownedNodePlacement.ts`、`ownedNodePlacement.spec.ts`
- `apps/web/src/stores/workbench/constructEditing.ts`
- `apps/web/src/stores/workbench/workbenchLayout.ts`
- `apps/web/src/stores/workbenchRuntime.ts`

工作台界面：
- `apps/web/src/modules/workbench/ModelLayoutPreviewBar.vue`
- `apps/web/src/modules/workbench/LayoutToolMenu.vue`、`LayoutToolMenu.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchSurface.vue`
- `apps/web/src/modules/workbench/OpdCanvas.vue`

几何与渲染：
- `apps/web/src/modules/workbench/opd/core/node-geometry.ts`
- `apps/web/src/modules/workbench/opd/core/state-layout.ts`
- `apps/web/src/modules/workbench/opd/core/refinement-envelope.ts`
- `apps/web/src/modules/workbench/opd/core/relation-routing.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-viewport.ts`、`canvas-viewport.spec.ts`

交付：
- `apps/web/scripts/package-workbench.mjs`
- 本任务规格文件
- 相邻 `opm-platform/apps/web-console/package.json`
- 相邻 `opm-platform/apps/web-console/vendor/opm-workbench-0.2.2-platform.33.tgz`

## 自动化验证

- 前端16个定向测试文件，238项通过；覆盖布局稳定性、多层属性组、多状态、长标题、过程次序、预览取消、分图授权、部分失败恢复和 SVG 更新后的视口适配。
- Java 4个定向测试类，22项通过；包括导入初始化7项、OPD 转移10项、工作区初始化3项、布局编辑2项。最终包再次执行导入初始化7项，全部通过。依赖 PostgreSQL 的测试使用临时测试 schema。
- Vue 类型检查、改动文件 ESLint、工作台打包、runtime 打包、平台前端生产构建通过。
- 已重启本地3000前端和17850画布服务，工作台依赖更新为 `0.2.2-platform.33`。

## 实际文件验证

通过平台真实导入入口，在独立临时主题验证以下6份文件，共91张图、681个内部节点 occurrence、658条关系 occurrence：

| 文件 | 图数 | 验证 |
| --- | ---: | --- |
| `model-package-1791529085696-6af32222.json` | 75 | 首次导入逐图无独立重叠、状态不越界；全部图预览；取消不写；全部75张图应用、保存、同步和重开几何一致；未额外执行大模型整体撤销 |
| `model-package-1791529185577.json` | 4 | 导入、全部图预览、应用、撤销、重新应用、保存、同步和重开通过 |
| `model-package-1791530087266.json` | 1 | 同上 |
| `model-package-1791530151605.json` | 2 | 同上 |
| `阿大撒大撒.json` | 1 | 同上 |
| `因果关系分析V3.json` | 8 | 同上 |

预览逐张检查实际 SVG 在视口内；应用前后核对语义节点及关系端点不变。测试主题已删除，生成的测试模型通过现有生命周期接口归档，可恢复。用户原有主题54仅预览、取消，未应用或覆盖其布局。

验证辅助脚本与报告位于已忽略的 `.codex/import-layout-acceptance.mjs` 和 `.codex/import-layout-acceptance-report.json`，不纳入产品构建。浏览器截图在平台 `logs/model-layout-04-final-preview.png`。

75图模型整体应用另外执行验证，报告为 `.codex/import-layout-large-acceptance-report.json`；串行处理按子图持续反馈进度，全部完成。另已通过真实工具栏按钮进入全模型预览、切图并取消。临时生成但未使用的 `.32` 工作台包移至已忽略的 `.codex/` 保留，平台只引用最终 `.33` 包。
