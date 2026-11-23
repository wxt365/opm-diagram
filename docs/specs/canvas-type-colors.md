# 画布按元素类型统一配色

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: frontend-vue (primary)、backend-springboot、testing、db-migration。四项覆盖同一配色的前端、共享持久化与验证；技术规则沿用相邻 platform，存储沿用 diagram 已有 JDBC/PostgresStore。

## 目标与边界

用户最新要求替代 canvas-element-colors.md 的单实例配色交互：修改一个元素的颜色，修改的是该类型在所有画布中的统一边框/填充色。范围为同一画布运行时部署下所有项目、模型、子图，包括以后创建的元素。对象、过程、属性、操作、状态分别设置；不是按名称或实体 ID 匹配。

允许调整 apps/web 的配色组件、共享状态/API、画布展示与相关验证；local-runtime 的配色 controller/service/repository、Flyway 增量 SQL 及接口文档；platform 更新工作台包及集成代理的配色 API 精确白名单。允许为共享配色新增 API 和独立小表。不添加依赖，不改业务数据、语义、关系线和已有版本格式，不清空或重写模型。

## 契约及兼容

新增 GET /api/v1/canvas/node-colors 返回 {data: {类型: {stroke?, fill?}}}；POST /api/v1/canvas/node-colors/{kind} 以 {stroke?, fill?} 原子替换一种类型的设置，{} 恢复该类型默认。颜色仅允许六位十六进制，类型白名单。沿用会话/来源校验和异常响应。服务端 PostgreSQL 保存，全体画布统一读取；配色不属于模型内容，不产生草稿脏状态，不需要保存草稿。

实际工作台统一配色优先，忽略已有 layout.appearance 的个体覆盖；保留旧数据及其历史读取接口兼容，不删除 Revision 0.7、Digest/5、V4。独立旧渲染入口未传统一色板时保持个体配色兼容。

Flyway V5 新建 canvas_node_color（kind 主键、stroke/fill 可空），无业务回填；仅本项目 PostgreSQL 方言。新增表兼容旧代码，先运行后端迁移再更新前端。回滚界面保留表及已有模型版本，不删除用户数据。只创建新表，不锁业务大表。

## 计划及验收

边界已确认。先实现独立配色持久化与 API，再接入类型色板和仅展示刷新，最后集成包、重启和浏览器验证。

- TYPE-01：面板明确“所有画布中的同类元素”，修改/重置仅影响所选类型的全部节点，其他类型独立。
- TYPE-02：跨模型/子图、刷新、服务重启、新建元素保持一致；已打开页面同源广播刷新，其他窗口焦点恢复及定时刷新读取服务端。
- TYPE-03：配色独立自动保存，不污染语义或布局，不触发未保存提示；错误可见，写失败不假装成功。
- TYPE-04：暗底文字、最终状态双线框、选中高亮正确；纯配色刷新不触发布局和全图路由。
- SHIP-01：定向前端/后端验证、类型检查、工作台及平台构建、真实页面跨图核对；真实配色测试记录并恢复原设置。

## Checklist

引用本文件；TYPE-01 至 TYPE-04、SHIP-01 已完成。禁止范围已核对；新 API、单表迁移属于本次实现范围。

## 验证结果

- Vitest 四文件138项通过：组件、配色状态、X6增量节点、WorkbenchView。覆盖统一覆盖旧个体色、重置、新节点、暗底、最终状态双框、读写竞态、写失败及停止轮询。
- vue-tsc 全项目及工作台导出检查通过，相关前端文件 ESLint 通过。工作台 .30 与平台生产构建通过；平台有既有大包提示。
- JUnit CanvasNodeColorControllerTest 两项基于真实 PostgreSQL 隔离模式通过，覆盖 Flyway全量/重复启动、保存/重建读取/重置、类型独立、非法请求及会话拦截。实际 Spring 容器启动验证发现 repository 不能声明 final（CGLIB代理），已修正并验证17850健康UP。
- 平台 OpmWorkbenchServiceTest 17项通过，含精确代理白名单、拒绝其他路径及配色更新不锁主题。
- Flyway V5 已应用本机使用的 opm_diagram schema，新增一张独立设置表；没有重写用户模型数据。
- 真实 Chrome 主题54/21的两个不同模型分别7/6个根图对象同步变蓝；54的子图8个对象同色，刷新后保留，恢复默认生效。浏览器无脚本错误、无模型 commands/save 请求、draft token及layoutDirty未变。验证后恢复原配色。报告/截图在 platform/logs/canvas-type-colors-browser.json、canvas-type-colors.png。页面临时脚本在被忽略的 diagram/.codex/type-colors-browser.mjs。
- runtime17850、业务服务8081及前端3000已重启，安装包与新构建index.js哈希一致。首次打包遇Windows运行中jar锁，停止已核验进程后重新打包成功；首次平台离线构建选错缓存，改为已有内网mirror配置后测试通过。

已验证同源浏览器广播、跨模型/子图、页面刷新；不同设备同步使用30秒可见轮询/焦点刷新，未实测多设备浏览器。服务实例重建后的数据库读取由JUnit验证，未为此额外停止真实用户正在使用的服务。

## 本次修改清单

相对 opm-diagram：

- docs/specs/canvas-type-colors.md
- docs/specs/canvas-element-colors.md（标注新交互取代旧范围）
- docs/contracts/canvas-node-colors.md
- apps/web/scripts/package-workbench.mjs
- apps/web/src/shared/nodeAppearance.ts
- apps/web/src/shared/api/localRuntimeApi.ts
- apps/web/src/workbench/contracts.ts
- apps/web/src/stores/workbenchRuntime.ts
- apps/web/src/stores/workbench/canvasNodeColors.ts
- apps/web/src/stores/workbench/canvasNodeColors.spec.ts
- apps/web/src/modules/workbench/ElementAppearanceProperty.vue
- apps/web/src/modules/workbench/ElementAppearanceProperty.spec.ts
- apps/web/src/modules/workbench/WorkbenchInspector.vue
- apps/web/src/modules/workbench/WorkbenchSurface.vue
- apps/web/src/modules/workbench/OpdCanvas.vue
- apps/web/src/modules/workbench/opd/core/x6-node-layer.ts
- apps/web/src/modules/workbench/opd/core/x6-node-layer.spec.ts
- services/local-runtime/src/main/java/org/opm/localruntime/api/CanvasNodeColorController.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/CanvasNodeColorService.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/CanvasNodeColorRepository.java
- services/local-runtime/src/main/resources/db/migration/postgresql/V5__canvas_node_colors.sql
- services/local-runtime/src/test/java/org/opm/localruntime/api/CanvasNodeColorControllerTest.java

相对 opm-platform：

- apps/web-console/package.json
- apps/web-console/vendor/opm-workbench-0.2.2-platform.30.tgz
- services/opm-modeling/opm-business-service/src/main/java/com/opm/platform/opmmodeling/business/service/OpmWorkbenchService.java（精确配色代理白名单）
- services/opm-modeling/opm-business-service/src/test/java/com/opm/platform/opmmodeling/business/service/OpmWorkbenchServiceTest.java（对应白名单回归）
