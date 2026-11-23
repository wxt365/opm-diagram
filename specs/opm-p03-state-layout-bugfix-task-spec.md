# 状态布局自适应修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix。
Active Playbooks: none (primary)。`.harness` 不存在。

## 目标与验收

- STATE-01：状态在对象标题下排列，新增优先复用同排空间，放不下换行；容器高度随内容增长。
- STATE-02：独立拖动状态不覆盖同属状态，可扩展内容区域；拖动 owner 时保持所属联动及去重。
- STATE-03：长状态名称换行并撑高状态；已有重叠通过显式自动布局修复，正常手工位置不在加载时被重排。
- STATE-04：容器扩容时把右侧/下方 owned 特征及后代移开，保留连接、折叠与保存/撤销流程。对齐若导致状态重叠则明确拒绝。
- STATE-05：新建状态前提交待保存几何，避免本地移动 owner 后新增状态被二次偏移；通过平台组件验证实际画布。

## 边界

允许 `apps/web/src/modules/workbench/opd/core` 状态几何和渲染、`apps/web/src/stores/workbench` 创建/布局、`workbenchRuntime.ts` 的状态编辑依赖及对应测试；本规格/checklist；组件打包脚本；平台 vendor 包及 package.json。
允许新增定向回归测试（含 `tests/e2e/workbench-component.spec.ts`）及本地验证产物；禁止修改助手、数据库、后端、公共 API、生成契约、添加依赖或改无关业务。
非目标：全图自动避线、自动覆盖历史布局、改变状态语义/角色或旧版保存协议。
契约影响：继续使用现有 CREATE_STATE 和 UPDATE_LAYOUT_BATCH 几何协议；仅调整前端布局与组件版本。
平台 Task Type: bugfix；Active Playbooks: frontend-vue (primary)、testing；仅接入组件。

## 实现计划

1. 提取状态尺寸、空位与容器布局计算，覆盖多状态换行、碰撞、长文本及只读边界。
2. 接入创建、草稿拖动、编辑后整理、显式自动布局，外部特征随扩容避让；防止对齐制造新重叠。
3. 定向回归、类型/lint/构建和浏览器验证；打包并刷新平台实际依赖。

## 验证与回滚

验证 STATE-01 至 STATE-05，包含三个重叠状态、多行状态、长中文、FINAL 外框、owner 移动后新增、保存重读与撤销。
回滚仅撤销本次布局计算并切回原组件包，无 schema 或数据迁移。
