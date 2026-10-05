# Spec: OPM P0 前端动态交互确认

> 历史规格说明：本规格的活动 Revision URL 条款已由 `specs/opm-p03-stable-head-url-and-exact-revision-deeplink-design-task-spec.md` 取代；HEAD URL 省略 `revision`，精确 Revision 仅用于只读固定版本和永久链接。其余历史验收记录不变。

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 背景

DEV-00 已建立 Vue 工程。设计输入已冻结 P01-P03 的页面、状态、字段、组件交互、P0 弹层和原型验收口径，需要迁入 Vue 动态界面供设计确认。

## 2. 目标

完成 P01 项目库、P02 项目详情、P03 五区建模工作台及 OV01/02/03/05/06/11 的本地动态交互，覆盖新建项目到最小建模、视口/语义缩放分离、图文问题定位、校验、只读基线与建草稿主路径。

## 3. 非目标

- 不实现真实 OpenAPI 调用、SQLite、Flyway、文件访问、后台 SSE 或正式语义提交。
- 不实现 P04-P06、OV04、OV07-OV10、完整关系菜单、复杂自动布局或方法写入。
- 不修改 OpenAPI、Schema、设计文档、原型文件、后端工程或依赖版本。

## 4. 范围

### 包含范围

- `apps/web/src/**`：布局、路由、P01/P02/P03 模块、mock 适配、Pinia 状态、样式和前端测试。
- `specs/opm-p0-frontend-interaction-task-spec.md`。
- `docs/checklists/opm-p0-frontend-interaction-checklist.md`。

### 不包含范围

- `docs/contracts/**`、`docs/design/**`、`prototype/**`、`services/**`、`migrations/**`。

## 5. 设计输入 / 开发前文档基线

- 顶层与模块：`opm-modeling-tool-architecture.md`、`opm-modeling-tool-module-design.md`。
- 页面、状态、字段、组件交互：四份 `opm-modeling-workbench-*` 文档。
- 接口与原型：`opm-modeling-tool-application-api-contract.md`、P0 OpenAPI、`opm-prototype-acceptance-report.md`。
- 前端范围与落盘：`opm-frontend-handoff.md`。
- 缺口处理：真实 API 与领域规则不在本任务实现；mock 只模拟可观察页面状态，统一隔离在前端适配层。

## 6. 实现约束

- Vue Router 的当前活动口径见后继 HEAD/EXACT URL 规格；弹层、候选输入、viewport 和选择不进入 URL。
- Pinia 不保存第二份正式 Semantic Model；本地状态仅用于设计确认。
- 普通 viewport 缩放不得改变 revision、OPL 或校验状态；语义缩放必须先经确认弹层并显示新修订影响。
- 只读基线必须禁用语义写入，同时保留查看、视口、定位和基于基线创建草稿。
- 所有动态控件使用稳定 `data-testid`；不依赖中文文案完成 E2E 定位。

## 7. 验收标准与验证

1. P01 搜索、范围切换、OV01 新建项目进入 P02 可用。
2. P02 展示项目/模型，OV02 新建模型后进入 P03 可用。
3. P03 包含导航、画布、属性、文本/问题/历史 tabs 五区；Object、Process、Consumption 候选、选择联动和属性候选提交可用。
4. 视口缩放不改 revision；语义缩放需确认并显示新 revision。
5. 校验有运行和完成状态；OV06 只能在文本 current、校验 current、无阻断的 mock 条件下启用。
6. 基线只读与基于基线创建草稿可切换。
7. 执行 lint、typecheck、unit、build、浏览器主路径验证和桌面/移动截图检查。

## 8. 兼容性、风险与回滚

- 不影响既有 HTTP 契约、数据库、后端或原型；仅新增浏览器本地的确认态。
- mock 结果不是正式业务结果，后续接入 generated client 时必须以服务器 revision/projection 覆盖。
- 回滚：删除本任务新增的前端模块并恢复当前 `apps/web/src` 空壳；不涉及数据或 schema 回滚。
