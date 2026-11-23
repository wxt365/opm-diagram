# 画布元素颜色配置

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

> 当前交互已由用户最新要求改为按类型统一配色，见 [canvas-type-colors.md](canvas-type-colors.md)。本文件记录早期单实例配色及其版本格式兼容实现，不能作为当前页面配色范围的依据。

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: frontend-vue (primary)、backend-springboot、testing、db-migration。
四项覆盖同一个调色、保存、摘要及恢复链路。diagram 未提供 .harness，沿用相邻 platform 的技术 playbook；实际实现与命令以 diagram 为准。

## 目标与边界

在元素基本信息的名称、备注后增加边框颜色、填充颜色及恢复默认。范围包含对象、过程、属性、操作、状态；按 occurrence 的 layout 保存，仅影响当前图中的该元素。颜色即时预览，支持布局撤销/重做、保存和重新打开。历史版本只读，已有类型配色继续作为默认值，暗色填充保证文字可读。

允许修改 apps/web 的检查器、节点展示及布局状态，local-runtime 的草稿布局局部写入、投影、版本兼容，相关契约生成器、文档、测试，以及 platform 中工作台包引用。扩展现有 UPDATE_LAYOUT_BATCH 的可选 appearance，不新增接口。禁止新增依赖、改业务语义、修改关系样式、清空业务数据或修改无关用户改动。

## 契约与兼容

layout.appearance 为可选对象，含可选 stroke、fill，值限六位十六进制颜色。省略 appearance 保留服务端已有值，显式空对象清除覆盖。颜色只写入原始文档的指定布局，避免领域 DTO 写回丢失备注或扩展字段。新增 Revision 0.7 与 SaveContentDigest/5，不修改冻结的旧摘要定义；第一次有实际颜色变化才升级草稿，后续编辑不降级。投影从原始文档补充 layout.appearance，覆盖草稿及历史读取。

PostgreSQL Flyway V4 仅扩展 draft_content 的 digest_version 约束允许 /5，无新表、字段、回填；先更新 runtime，再更新工作台包。原有版本和摘要继续可读。迁移短暂获取约束变更锁。回滚界面可以回到旧工作台，但已产生 0.7 数据后保留新后端读取及 /5 约束，不删除或降级已保存数据。

## 实施顺序与验收

边界已确认。先补充契约、版本读取与原始布局保存，再接入颜色组件、节点渲染和本地布局历史，最后测试并集成启动。

- COLOR-01：所有节点可选择边框、填充及恢复默认；只读时不可编辑。
- COLOR-02：即时预览，选择高亮不会遮住自定义填充；深色填充下名称与类型可读；最终状态内外框一致。
- SAVE-01：颜色支持撤销重做，拖动、调整大小及语义编辑不会丢失，未改色不产生脏状态，重置默认能正确保存。
- SAVE-02：服务端只更新目标 layout，校验非法颜色与目标；保存、重开、历史投影及旧摘要兼容通过。
- SHIP-01：前端定向测试/类型检查/构建及后端摘要与保存集成验证通过；在集成界面核对真实控件与保存请求，不改写用户业务模型。

## 验证记录

COLOR-01、COLOR-02、SAVE-01、SAVE-02、SHIP-01 已完成；禁止范围与兼容边界已核对。颜色字段使用原生颜色选择器，无新增依赖。选中时保留自定义填充；文本/问题定位仍可临时高亮；深色填充自动使用白色文字。细化容器仅在没有自定义填充时保持透明。

前端执行 Vitest：ElementAppearanceProperty、WorkbenchView、x6-node-layer、projectionMapping、layoutSelection 五个文件共 140 项通过；vue-tsc 类型检查及本次组件/store/渲染文件 ESLint 通过。工作台 .29 及平台生产构建通过，平台保留既有大包提示。

后端执行 JUnit：SaveContentDigestV1Test 9 项、DraftSaveControllerTest 23 项、SemanticLayoutEditorTest 2 项通过。DraftWorkspaceControllerTest 全类首次运行 61/62 通过，新增用例发现旧 fixture 的状态越界；纯颜色操作现只校验实际改变的几何，避免被旧布局无关问题阻断。随后批量布局用例通过，新增颜色用例修正 fixture 的重启路径后单独通过。保存集成验证了 /5 写库、历史颜色、重启恢复、跨图独立及后续备注不降级。旧摘要向量继续通过。最初一次数据库测试缺少 OPM_PG_PASSWORD，设置现有测试连接后已重跑；所有数据库测试使用独立 opm_diagram_tool_* 模式。

契约生成器 generate-element-appearance-contract.mjs --check、generate-draft-workspace-contract.mjs --check 通过。Flyway V4 已在 opm_diagram 成功执行，只扩展摘要版本约束。Runtime 17850 已重启，健康检查 UP；前端 3000 已加载 .29 包并重启。Chrome 主题 54 核对对象、过程、属性的两种颜色即时预览及恢复默认；测试结束撤销本地展示修改，没有提交用户模型的 commands/save。状态由组件、渲染及后端用例验证，所选真实子图没有状态。页面零脚本错误，截图与报告位于相邻平台 logs/canvas-element-colors.png、logs/canvas-element-colors-browser.json。临时浏览器脚本位于被忽略的 .codex/element-colors-browser.mjs。

## 修改文件清单

相对 opm-diagram：

- apps/web/scripts/package-workbench.mjs
- apps/web/src/modules/workbench/ElementAppearanceProperty.vue
- apps/web/src/modules/workbench/ElementAppearanceProperty.spec.ts
- apps/web/src/modules/workbench/WorkbenchInspector.vue
- apps/web/src/modules/workbench/WorkbenchView.spec.ts
- apps/web/src/modules/workbench/opd/core/x6-node-layer.ts
- apps/web/src/modules/workbench/opd/core/x6-node-layer.spec.ts
- apps/web/src/shared/nodeAppearance.ts
- apps/web/src/shared/types/modeling.ts
- apps/web/src/shared/api/localRuntimeApi.ts
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- apps/web/src/stores/workbench/layoutSelection.ts
- apps/web/src/stores/workbench/projectionMapping.ts
- apps/web/src/stores/workbench/workbenchLayout.ts
- apps/web/src/stores/workbenchRuntime.ts
- scripts/generate-draft-workspace-contract.mjs
- scripts/generate-element-appearance-contract.mjs
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- docs/contracts/schemas/opm-revision-v0.7.schema.json
- docs/contracts/schemas/opm-save-content-v5.schema.json
- docs/specs/canvas-element-colors.md
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOwnedConstructEdits.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSubgraphReorganization.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/MethodArchitectureLinks.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/MethodClassificationEdit.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/OpdJsonPackage.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/OpdProjectionQuery.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/RevisionDocumentReaderRouter.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionReader.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSeedRepository.java
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
- services/local-runtime/src/main/resources/draftsave/save-content-v5.schema.json
- services/local-runtime/src/main/resources/db/migration/postgresql/V4__element_appearance_digest.sql
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/semantic/SaveContentDigestV1Test.java

相对 opm-platform：

- apps/web-console/package.json
- apps/web-console/vendor/opm-workbench-0.2.2-platform.29.tgz
