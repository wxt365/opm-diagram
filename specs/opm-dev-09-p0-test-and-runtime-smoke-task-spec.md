# Spec: OPM DEV-09 P0 Test and Runtime Smoke

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `frontend-vue`
- `backend-springboot`

## 1. 背景

DEV-08 已完成 P03 的 Local Runtime 联调，但现有 Playwright 用例仍指向已删除的设计确认 fixture 和 Mock-only 弹层，不能证明真实 P0 主路径、重开或视口行为。

## 2. 目标

建立独立测试数据目录中的真实浏览器 E2E 基线，覆盖新建项目/模型、Object/Process/Consumption、OPL、Revision、校验、重开与桌面/移动视口；补齐可重复运行的 Local Runtime + Vite 测试启动方式。

## 3. 非目标

- 不伪造 Baseline 只读打开、基于 Baseline 创建 Draft、语义缩放、State、细化或完整关系能力。
- 不修改 OpenAPI、SQLite V1、生产 Profile/Rule/Grammar/Symbol 资产或新增依赖。
- 不把 E2E 通过表述为 ISO 19450 符合性证据。

## 4. 已确认设计缺口

`docs/design/opm-development-execution-pack.md` 的 DEV-09 验收要求 “Baseline -> 新 Draft -> 重启重开”。当前 `API-VER-004` 仅创建 baseline；OpenAPI 和 Local API 没有按 baseline 打开、创建 Draft 或传入 revision 的 workspace session operation。因此本包不得将该链路标为完成；缺口保留给版本化 API/语义设计包处理。

## 5. 范围

### 包含范围

- `tests/e2e/**`：真实 P0 E2E、测试启动和隔离数据目录。
- `apps/web/**`：仅为可测试性或真实 E2E 必要的行为修复。
- `services/local-runtime/**`：仅为真实 E2E 可重复启动或已冻结 API 的测试支持修复。

### 不包含范围

- `docs/contracts/openapi/**`、`docs/contracts/migrations/**`、`packages/**`。
- P04-P06、DEV-CANVAS-* 与缺失的 Baseline/Draft API 设计。

## 6. 设计输入

- `docs/design/opm-development-execution-pack.md` 6.6、9.1、9.2。
- `docs/design/opm-test-strategy.md` 2、4、7、9、10、11。
- `docs/design/opm-development-technology-baseline.md` 4、11。
- `docs/design/opm-modeling-workbench-state-model.md` 4、6、10。

## 7. 方案要求

1. 每个 E2E 场景使用独立、临时的 Local Runtime storage root；不得读取开发者项目目录。
2. E2E 通过同源启动令牌和页面交互完成写操作，不向页面注入 Mock store 或绕过会话守卫。
3. P0 成功路径必须断言服务端返回的 Revision、OPL 与重开后的 Projection 一致；viewport 变化不得创建 revision。
4. 覆盖 `1440x900`、`1280x800`、`390x844`，移动端以真实画布平移证明内容可达。
5. 失败、冲突、只读只在当前 API 真正可构造时测试；不可构造的 Baseline Draft 链路在报告中明确缺口，不以 fixture 代替。

## 8. 验收与验证

1. `npm run test:e2e` 启动独立 runtime 与 Vite 并通过已实现 P0 场景。
2. E2E 覆盖 P01 -> P02 -> P03、三条 P0 命令、OPL、Revision、校验、重开和三个视口。
3. 前端 lint/typecheck/test/build、Java 21 verify、contract validate、diff check 通过。
4. 报告明确缺失的 Baseline/Draft 语义与 DEV-09 未完成范围。

## 9. 回滚

回退新增 E2E 启动与场景文件，不影响项目数据；E2E 临时目录位于系统临时目录，可在测试后删除。
