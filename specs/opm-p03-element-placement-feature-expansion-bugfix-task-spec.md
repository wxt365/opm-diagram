# 画布新增元素定位与属性展开修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix。
Active Playbooks: none (primary)。仓库引用的 `.harness` 目录不存在，沿用现有 Vue/X6 实现与测试方式。

## 目标与边界

- PLACE-01：工具栏新增对象、过程，按当前可见区域中心计算模型坐标，考虑缩放、平移及滚动；保持当前视口。
- FEATURE-01：新增 Attribute/Operation 时展开所属对象或过程，已有属性、操作继续可见。
- FEATURE-02：其他 owner 的折叠状态保持不变，手动折叠、定位临时展开和重新加载的默认行为保持兼容。
- 非目标：不修改 OPM 语义、保存协议、公共 API、数据库、依赖或后端；不调整无关布局。
- 允许修改：本规格与 checklist；`apps/web/src/modules/workbench/{OpdCanvas.vue,OpdCanvas.spec.ts,WorkbenchSurface.vue,WorkbenchView.spec.ts}`；`apps/web/src/modules/workbench/opd/core/canvas-viewport{.ts,.spec.ts}`；`apps/web/src/stores/workbenchRuntime.ts`；`tests/e2e/workbench-attribute-owner.spec.ts`。
- 禁止修改：其他业务模块、持久化数据、配置、依赖、生成契约、助手现有改动。

平台接入边界补充：平台实际消费 vendor 组件包，因此允许更新 `apps/web/scripts/package-workbench.mjs` 的包版本，以及 `../opm-platform/apps/web-console/package.json`、`package-lock.json`、`vendor/opm-workbench-0.2.2-platform.4.tgz` 和本地安装。保留旧版本组件包，不引入第三方依赖。平台侧 Task Type: bugfix；Active Playbooks: frontend-vue (primary)、testing；只更新组件交付包，不修改平台业务实现。`.harness/repo-profile.md` 是模板仓库说明，实际命令以项目 package.json 为准。

## 实现计划

1. 在现有视口工具中复用可见区域，提供新增元素的模型坐标；经画布组件和工具栏传给既有创建命令，保留无视口调用的兼容位置。
2. 修改新增 Feature 的局部折叠状态同步，只展开有新增 Feature 的 owner。
3. 调整现有回归用例，执行定向验证、类型检查、lint、构建和差异检查。

## 验证与回滚

验证平移/缩放/滚动后创建位置、空图和其他 owner 状态，以及前端创建命令传递位置。对无法执行的验证明确记录限制。
回滚本任务前端改动即可，无数据库变更；不回退用户已有助手修改。
