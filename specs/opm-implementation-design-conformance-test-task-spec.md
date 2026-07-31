# Spec: OPM 当前实现与冻结设计符合性验收

规格版本：`1.0`

规格状态：`ACTIVE`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `frontend-vue`
- `backend-springboot`

## 1. 背景

全量设计基线已经冻结并将开发门置为 `READY_FOR_DEVELOPMENT`，当前工作树随后形成了前端、后端、机器契约、Profile、Golden 和发布相关实现。用户要求测试当前实现是否符合冻结设计。本任务只做实现验收和证据审计，不因发现失败而修改业务实现。

## 2. 目标

1. 以 `docs/design/opm-design-freeze-baseline.md` 和 `docs/design/opm-development-execution-pack.md` 为顶层基线，验证当前实现与 `FROZEN_INCLUDED` 设计责任的符合性；
2. 执行当前仓库真实可用的契约、Golden、兼容、前端、后端、E2E 和浏览器验证；
3. 对 DEV-CANVAS-00~06 的设计 Gate 给出 `PASS / FAIL / BLOCKED / NOT_RUN` 状态和可复核证据；
4. 区分静态代码存在、自动化测试通过、浏览器行为通过、发布就绪和 ISO 19450:2024 符合性证明；
5. 输出缺口、影响、建议处理顺序，不把局部通过外推为整体符合。

## 3. 非目标

- 不修复前端、后端、脚本、Profile、Schema、Golden、E2E 或发布实现；
- 不修改公共 API、SQLite schema、运行配置、依赖或生产 enablement 状态；
- 不生成或补写缺失的设计能力、Golden fixture、release catalog 或 ISO 原子规则；
- 不回退、覆盖或格式化用户工作树中的既有改动；
- 不声明完整 ISO 19450:2024 符合性；冻结基线中 `FROZEN_DEFERRED` 的标准能力不属于本次实现通过范围。

## 4. 范围与修改边界

允许只读检查和执行：

- `apps/**`、`services/**`、`packages/**`、`scripts/**`、`tests/**`；
- `docs/requirements/**`、`docs/design/**`、`docs/contracts/**`、`specs/**`、`docs/checklists/**`；
- 根 `package.json`、`package-lock.json`、`pom.xml`、`mvnw`；
- 本地 loopback Web/Runtime、临时测试数据库和构建目录。

允许修改：

- `specs/opm-implementation-design-conformance-test-task-spec.md`；
- `docs/checklists/opm-implementation-design-conformance-test-checklist.md`；
- `docs/reports/opm-implementation-design-conformance-test-report.md`；
- 测试命令在既有 `target/**`、`dist/**`、测试输出目录中产生的可再生文件。

禁止修改：

- `.harness/**`；
- 除上述三个验收文档外的现有源码、测试、设计、契约、配置和资产；
- Git 历史、远端、分支和用户现有改动。

本任务不允许修改 schema、API、配置、依赖或测试代码。若测试本身缺失或错误，记录为缺口，不现场补测。

## 5. 设计输入基线

- 全量冻结与范围：`docs/design/opm-design-freeze-baseline.md`；
- 开发包、依赖、DoD 与回滚：`docs/design/opm-development-execution-pack.md`；
- 测试层级、矩阵、阈值与证据：`docs/design/opm-test-strategy.md`；
- 前端页面、状态、字段、组件和 handoff：`docs/design/opm-modeling-workbench-*.md`、`docs/design/opm-frontend-handoff.md`；
- API、Revision、持久化和交换：`docs/design/opm-modeling-tool-application-api-contract.md`、`docs/contracts/**`、持久化设计；
- State、16/8/10 关系、Control Modifier、OPL/Trace/Golden：完整画布专题、符号文本契约及 DEV-CANVAS-00~05 规格/checklist；
- 视觉、E2E、性能、恢复、enablement 和发布：DEV-CANVAS-06 规格/checklist。

## 6. 证据状态模型

每个验收项只能使用以下状态：

- `PASS`：要求的实现、自动化或运行证据均已实际执行且满足冻结标准；
- `FAIL`：已执行验证并得到不符合结果，或静态实现与冻结契约直接冲突；
- `BLOCKED`：因环境、缺失依赖、缺失前序机器输入或不可执行入口而无法验证；
- `NOT_RUN`：本次范围内尚未执行，不能推导为通过；
- `NOT_APPLICABLE`：冻结基线明确为 `FROZEN_DEFERRED` 或不属于当前开发基线。

仅有文件、类型、按钮、fixture 或 health endpoint 不构成 `PASS`。发布 Gate 只有在其规定的原始报告、重复执行、摘要和状态算法全部满足时才能通过。

## 7. Spec Mapping 与验收层级

| 设计责任 | 主要证据 | 通过标准 |
| --- | --- | --- |
| Scope/冻结边界 | 冻结状态审计、正式索引 | 无开放设计状态；实现未越过 `FROZEN_DEFERRED` |
| 页面/状态/字段/组件 | 前端单测、build、浏览器 | P01~P05/P03 主工作台状态、只读/阻断/错误态与设计一致 |
| Object/Process/State | 前端组件、API、重开 | State 可见、owner containment、编辑/投影/OPL/Trace/重开闭环 |
| 16/8/10 关系工具链 | catalog、候选、命令、浏览器 | 图标入口、分类、规范端点、逐 Capability 证据完整 |
| Control 表示 | Revision/Fact roundtrip、Golden | 基础 Fact + 唯一成对 Modifier，SQLite V1 不变，非法组合阻断 |
| API-EDT 0.2 | OpenAPI、generated DTO、handler、contract test | option/State/Fact/impact token/错误/兼容闭合且版本一致 |
| Revision/SQLite | reader/writer/repository/integration | 0.1/0.2 路由、原子提交、不可变 Revision、重开与幂等通过 |
| OPL/Token/Trace | Golden contract/replay/coverage | 16/8/10、Control 变体、结构 fan、Token byte range、Trace、digest 全闭合 |
| DEV-CANVAS-05 handoff | handoff schema 与原始报告 | 规定计数和 SHA 一致，状态为 `READY_FOR_DEV_CANVAS_06` |
| DEV-CANVAS-06 release | Visual/E2E/Performance/Recovery/RC 报告 | 所有机器 Gate 按冻结算法 `READY`，production gate 状态可审计 |
| 工程质量 | lint/typecheck/unit/build/backend verify | 所有命令退出码为 0，无跳过关键测试 |
| ISO 声明边界 | 冻结延期矩阵 | 不把当前 Profile 草案或局部 Golden 表述为完整 ISO 符合性 |

## 8. 验收标准

1. `contract:validate`、`golden:check`、`golden:coverage`、Golden replay、Revision compatibility 和 DEV-CANVAS-05 handoff 均记录真实退出结果；
2. 前端 lint、typecheck、unit、build 全部实际执行，测试数与失败数可复核；
3. 后端 `verify` 或等价真实 Maven 验证实际执行，测试数、失败、错误和跳过数可复核；
4. Playwright E2E 实际执行并记录浏览器、case 数和失败详情；缺少设计要求的 suite 视为覆盖缺口；
5. 浏览器人工验收至少验证画布非空、State、关系工具链、候选/提交、OPL/Trace、缩放、错误态和重开；
6. 对 DEV-CANVAS-00~06、P0 主路径及 20 个 `FROZEN_INCLUDED` 责任输出逐项状态；
7. 发布与 ISO 结论不得由单元测试或静态文件存在代替；
8. 形成正式验收报告，所有失败包含命令/场景、直接证据、设计引用、影响和建议优先级。

## 9. 验证方式

1. 审计冻结基线、执行包、DEV-CANVAS 规格/checklist 与当前实现入口；
2. 执行根脚本的契约、Golden、兼容、handoff、前端和后端验证；
3. 执行 Playwright E2E；
4. 启动或复用本地运行时，使用受控浏览器按设计场景进行人工验收；
5. 检查实际生成报告、manifest、SHA、计数和 enablement 状态；
6. 对验收文档执行 `git diff --check`，并复核未修改业务实现。

## 10. 风险与限制

- 全量 Maven、Golden replay、E2E 和浏览器矩阵可能耗时较长；未执行项必须保持 `NOT_RUN`；
- 当前工作树未提交，测试生成文件与用户改动必须严格区分；
- 环境中浏览器、Java 21、Node 22 或发布硬件不满足时，对应层级只能为 `BLOCKED`，不能降级后宣称通过；
- DEV-CANVAS-06 的视觉 378 case、E2E 194 case、性能和恢复证据缺一不可，普通 `npm run test:e2e` 通过不自动等于发布 Gate 通过；
- `.harness/repo-profile.md` 与当前实际工程不一致，本次以仓库真实构建文件为事实，不修改 Harness。

## 11. 回滚

本任务不修改业务实现。需要回滚时只删除本次新增的规格、checklist 和验收报告；不回退用户源码、设计、机器资产、测试输出或运行数据。

## 12. 事实与假设

### 12.1 事实

1. 全量冻结基线声明 `development_gate=READY_FOR_DEVELOPMENT`，但明确实现与发布证据需另行验证；
2. 当前根 `package.json` 提供 contract、Golden、compatibility、handoff、前端、E2E 和 backend verify 入口；
3. 当前工作树包含大量用户实现改动，本任务无权回退或修复；
4. 完整 ISO 原子规则、Annex A 全量 Grammar、Symbol Catalog 和符合性声明仍为冻结延期范围。

### 12.2 假设

1. 当前未提交工作树代表用户要求验收的候选实现；
2. 本地测试环境可创建临时数据库和构建输出；
3. 若本地服务未运行，可按仓库既有命令启动用于 loopback 验收，但不改变生产配置。
