# OPM 当前实现与冻结设计符合性验收报告

报告版本：`1.2`

验收日期：`2026-07-31`

总体状态：`FAIL / NOT_READY_FOR_RELEASE`

## 1. 结论

当前候选实现已经通过 P01 -> P02 -> P03 在线建模主路径，前端从 Runtime bootstrap 读取 active binding，Profile `0.1.0/0.2.0` 双源冲突已消除。完整 Playwright 为 `9/9 PASS`；桌面浏览器人工复核完成 Project、Model、Object、Process、Consumption、OPL、缩放和刷新重开，Revision、`2` 个节点、`1` 条边及 `Process 1 consumes Object 1.` 均保持不变。

DEV-CANVAS-05 handoff 已达到 `READY_FOR_DEV_CANVAS_06`，34 个 Capability 均为 `ELIGIBLE_FOR_RELEASE_VALIDATION`；DEV-CANVAS-06 的 `GATE-06-01` Intake Schema、runner、反例测试和 exact Handoff 执行已达到 `READY_FOR_RELEASE_VALIDATION`。这关闭了旧报告中的 P0 在线阻断与 Intake 缺失问题。

当前仍**不能进入发布或生产 enablement**：`GATE-06-02` 的 Enablement Schema、runner、派生复算和失败守卫已实现，但真实 Candidate/Activation 尚未生成；`GATE-06-03~06` 尚无完整实现和机器证据。两配置档 96 Capability、`.opmp` reader/writer/roundtrip、378-case visual、194-case release E2E、性能、恢复和 6/12 clean smoke 未闭环。生产 gate 必须继续保持 `DISABLED + []`。

因此，本轮实现符合性从旧报告的 `PASS=8 / FAIL=12` 更新为 `PASS=14 / FAIL=6`，总体结论仍为 `FAIL / NOT_READY_FOR_RELEASE`。ISO 19450:2024 结论继续保持 `EVIDENCE_MISSING / 无法判断`。

## 2. 验收边界

- 顶层基线：`docs/design/opm-design-freeze-baseline.md`、`docs/design/opm-development-execution-pack.md`；
- 测试基线：`docs/design/opm-test-strategy.md`；
- 完整画布：DEV-CANVAS-00~06 规格和 checklist；
- 本报告基于当前未提交工作树和本轮完整重验，不把 Git commit 状态等同于候选实现状态；
- 本轮在上一版文档刷新基础上加固 GATE-06-02 Enablement Schema、runner 和隔离测试；未修改 `apps/**`、`services/**`、Profile、Golden、handoff/release 资产、配置或依赖；
- `FROZEN_DEFERRED` 不要求当前实现，但禁止被宣称为已实现；
- 状态使用 `PASS / FAIL / BLOCKED / NOT_RUN / NOT_APPLICABLE`。局部 PASS 不覆盖责任级退出条件。

## 3. 测试环境

| 项目 | 实际值 |
| --- | --- |
| OS/架构 | macOS arm64 |
| Node/npm | Node `22.22.0` / npm `10.9.4` |
| Java | GraalVM JDK `21.0.7` |
| 前端 | Vue `3.5.26`、Vite `7.2.2`、X6 `2.18.1` |
| E2E | Playwright `1.57.0`，Chromium，`workers=1` |
| 桌面浏览器人工验收 | Runtime `127.0.0.1:17854` + Vite `127.0.0.1:5178`，隔离存储根 |
| 窄视口验收 | Playwright 真实 `390x844` viewport；内置浏览器本轮未提供动态重设 viewport 能力 |

首次契约/Golden 尝试误用了 Node 16，环境前置检查失败；切换到冻结要求的 Node 22 后同一验证全部通过。该首次结果不计为实现失败。

## 4. 关键发现

### `P0-01` 在线建模主路径与 Runtime active binding 已闭环

状态：`PASS`

直接证据：

1. 前端通过 `/opm-bootstrap.js` 获取 Runtime active binding，模型创建和后续编辑不再固定发送 Profile `0.1.0`；
2. Playwright `9/9 PASS`，覆盖 P01 -> P02 -> P03、State、16 Procedural、8 Control、10 Structural、OPL/Trace、提交、重开和 `390x844` 窄视口；
3. 桌面浏览器人工创建 Project、Profile `0.2.0` Model、Object、Process 和 Consumption 成功；
4. 人工复核从 `100%` 缩放到 `90%` 后 Revision 不变；刷新后 Revision 仍为 `revision.b224e4b719664c7fbf45452fd2f9a294`，画布保持 `2 node / 1 edge`，OPL 保持 `Process 1 consumes Object 1.`；
5. 浏览器控制台只有 Vite debug 连接日志，没有 warning/error。

### `P0-02` DEV-CANVAS-05 handoff、GATE-06-01 Intake 与 GATE-06-02 工具守卫已闭环

状态：`PASS`

直接证据：

- handoff raw SHA-256 为 `38accdf1e54c8b95214c217ff09a3f349b3f715defc4b7eade20fdfc8bc674da`；
- `handoff_status=READY_FOR_DEV_CANVAS_06`，`34/34` Capability 为 `ELIGIBLE_FOR_RELEASE_VALIDATION`；
- `GATE-05-01~06` 均为 `MATCHED`，Revision compatibility 为 `6 PASS + 7` 个预期 `BLOCKED`，失败 `0`；
- Intake runner 单测通过；exact Handoff 的 `8/8` checks 与 `34/34` capability intake 均为 `MATCHED`，状态为 `READY_FOR_RELEASE_VALIDATION`；
- Enablement 定向测试 `4/4 PASS`；verifier 能拒绝 status/proposed/decision/batch/source-build 篡改，重复输出不能覆盖，缺少 GATE-06-06 exact Schema/READY Report 时 Activation 返回阻断且不生成文件；
- production gate 仍为 `DISABLED`，`enabled_capability_ids=[]`。

### `P1-01` DEV-CANVAS-06 后续发布 Gate 未闭环

状态：`FAIL`

`GATE-06-02` 工具已实现，但真实 Candidate 仍等待 `GATE-06-03~05` exact Report，真实 Activation 仍等待 `GATE-06-06 READY` Report。`GATE-06-03~06` 的 visual、release E2E、performance、recovery 和 clean release smoke 尚无完整 runner、机器报告与执行结果。当前 `9/9` 开发级 Chromium E2E 不能替代冻结的 194-case release catalog。

### `P1-02` 两配置档 96 Capability 仍是设计完整、实现不完整

状态：`FAIL`

能力矩阵、字段 Schema、逐项闭包、隔离不变量和验收输入已经冻结；当前机器资产只有两个各 `38` 项的 `REPRESENTATIVE` ISO Profile，且没有中文草案 Profile。缺少两配置档 96 项唯一登记与隔离的可执行闭包，属于实现和证据缺失，不是设计待定。

### `P1-03` `.opmp` 1.0 物理格式已冻结，但尚未实现

状态：`FAIL`

设计已经唯一冻结为 `.opmp` ZIP、`application/zip`、UTF-8 Canonical JSON entries、SHA-256、`exchange_format_version=1.0` 和 `minimum_reader_version=1.0`。当前仍没有机器 Schema、ZIP writer/reader、staging/import/export、未知版本阻断和 golden roundtrip 证据。

## 5. 自动化与人工验收结果

| 验证 | 结果 | 证据摘要 |
| --- | --- | --- |
| `npm run contract:validate` | `PASS` | OpenAPI、generated DTO、Schema 样例和 API-EDT contract 有效 |
| `npm run golden:contract:test` | `PASS` | `25/25`；16 个 mutation、coverage catalog 和 Atomic 输入守卫通过 |
| `npm run golden:check` | `PASS` | 178 cases 结构有效 |
| `npm run golden:coverage` | `PASS` | 178 cases `EXACT` |
| `npm run golden:replay` | `PASS` | `130 PASS + 48` 个预期 `BLOCKED`，失败 `0`；260 个 committed Revision attempts 通过 |
| `npm run compatibility:replay` | `PASS` | `6 PASS + 7` 个预期 `BLOCKED`，失败 `0` |
| Handoff evidence/contract | `PASS` | GATE-05-01/04 evidence `MATCHED`；handoff 为 READY，34 项 eligible |
| `npm run release:canvas06:intake:test` | `PASS` | Schema、SHA、证据、计数和 production gate 反例通过 |
| exact DEV-CANVAS-06 Intake | `PASS` | `8/8` checks、`34/34` capability intake `MATCHED`，无 blocker |
| `npm run release:canvas06:enablement:test` | `PASS` | `4/4`；Candidate 复算、篡改阻断、不可变写入和 Activation 前置守卫通过 |
| `npm run lint` | `PASS` | 0 warning/error |
| `npm run typecheck` | `PASS` | `vue-tsc` 通过 |
| 前端 Vitest | `PASS` | 7 files，`40/40` |
| `npm run build` | `PASS_WITH_WARNING` | 构建成功；主 JS `643.53 kB`；`opm-bootstrap.js` 非 module 警告 |
| `npm run backend:verify` | `PASS` | 21 test files，`231/231`，failure/error/skipped 均为 0 |
| `npm run test:e2e` | `PASS` | Chromium `9/9`；含三视口、State、16/8/10、OPL/Trace、刷新重开 |
| 桌面浏览器人工验收 | `PASS` | 创建 Project/Model/Object/Process/Consumption，缩放、刷新和 OPL 持久化通过 |

## 6. `FROZEN_INCLUDED` 符合性矩阵

| ID | 状态 | 结论与证据 |
| --- | --- | --- |
| `DFR-001` | `PASS` | 单机、loopback、local session 与隔离本地存储边界成立 |
| `DFR-002` | `FAIL` | P01-P03 和 DEV-CANVAS-00~05 已形成证据；DEV-CANVAS-06 仅 GATE-06-01 READY，后续 Gate 未闭环 |
| `DFR-003` | `PASS` | P01 -> P02 -> P03 主路径、状态、字段和重开通过；P04-P06 保持冻结非目标 |
| `DFR-004` | `PASS` | State 图标工具链及 16/8/10 完整画布命令、候选、符号和重开由 9 个 E2E 覆盖 |
| `DFR-005` | `FAIL` | Chromium 三视口和人工 100% -> 90% 通过；25/100/400 visual、跨浏览器和 378-case release 矩阵缺失 |
| `DFR-006` | `PASS` | Thing/State/Fact/Modifier/Context/Occurrence/Revision 语义、正反例及持久化通过 |
| `DFR-007` | `FAIL` | 96 Capability 设计输入已冻结；当前机器 Profile 各 38 项，尚无两配置档 96 项唯一登记与隔离证据 |
| `DFR-008` | `PASS` | Clause 1~14/Annex 边界和 103 个规则组追踪保持；缺证据时返回 `EVIDENCE_MISSING` |
| `DFR-009` | `PASS` | 34 Capability Golden、候选过滤、在线提交和重开均有可执行证据 |
| `DFR-010` | `PASS` | Control 使用唯一基础 Fact 加受控 Modifier pair，Golden、roundtrip 和在线 8 类 Control 通过 |
| `DFR-011` | `PASS` | Structural 双向/互惠、fan/list/completeness、稳定 Fact 身份及 10 类在线提交通过 |
| `DFR-012` | `PASS` | 178 semantic、19 Atomic、Token/Trace/digest/replay 和 OPL precedence 机器证据通过 |
| `DFR-013` | `PASS` | Runtime active binding、Revision guard、幂等、错误、事务、在线提交和重开通过 |
| `DFR-014` | `PASS` | OpenAPI 0.2 draft、generated TS/Java DTO 和 contract test 一致 |
| `DFR-015` | `PASS` | Revision 0.1/0.2 reader/writer/roundtrip compatibility 13/13 matched |
| `DFR-016` | `PASS` | SQLite V1、迁移、不可变/原子提交、恢复和重开测试通过 |
| `DFR-017` | `FAIL` | `.opmp` 1.0 设计已冻结，无机器 Schema、reader/writer 和 golden roundtrip |
| `DFR-018` | `FAIL` | 当前分层自动化通过；378 visual、194 release E2E、性能、恢复和发布机器报告未完成 |
| `DFR-019` | `FAIL` | GATE-06-01 READY、GATE-06-02 工具守卫已实现；真实 Candidate/Activation、GATE-06-03~06 和 6/12 smoke 未完成，production gate disabled |
| `DFR-020` | `PASS` | `.opmp` 和 DEV-CANVAS-06 状态冲突已修复；正式索引、30 项责任及跨文档冲突重新核对为 0 |

汇总：`PASS=14`，`FAIL=6`，`BLOCKED=0`，`NOT_RUN=0`。总体状态由未满足的责任级退出条件决定，不能以 P0 主路径和 GATE-06-01 的 PASS 外推发布结论。

## 7. `FROZEN_DEFERRED` 边界

10 项延期责任均未发现越界生产声明：P04-P06、中文专属 Profile、OPL 直接编辑、约 511 原子规则、完整 Annex A Grammar、完整 Clause 4 Symbol Catalog、ISO 符合性声明、外部工具互操作、静态加密/涉密、远程协同/跨平台支持继续保持非目标。

因此 ISO 19450:2024 结论为：`EVIDENCE_MISSING / 无法判断`，不是“不符合”，也不是“部分符合”。

## 8. 后续实现顺序

1. 实现并执行 `GATE-06-03~05` 的 378 visual、194 release E2E、性能和恢复机器闭包；
2. 基于四类 exact Report 生成并复验真实 Candidate，保持 production gate disabled；
3. 完成 `GATE-06-06` release candidate、clean install/start/health/open/reopen/exit `6/6 case、12/12 attempt`，取得 READY Report 后再生成 Activation；
4. 实现两配置档 96 Capability registry/isolation；
5. 按 `.opmp` 1.0 契约实现机器 Schema、ZIP reader/writer、staging、版本守卫和 golden roundtrip；
6. 全部 Gate 有 exact SHA、Schema 和机器报告后，才能生成 Activation；生产 Capability 不得手工启用。

## 9. 事实与限定

### 事实

- 本报告中的 PASS/FAIL 来自本轮实际命令、机器资产、当前源码或浏览器行为；
- 当前 handoff 为 `READY_FOR_DEV_CANVAS_06`，exact Intake 为 `READY_FOR_RELEASE_VALIDATION`；
- GATE-06-02 Schema/runner/verifier 已实现；真实 Candidate/Activation 均未生成，Capability 启用数为 `0`；
- 本轮完整 Playwright 为 `9/9 PASS`，不再存在旧报告所述的 `8/8` binding conflict；
- 浏览器隔离页面为 `http://127.0.0.1:5178/`，Runtime 为 `http://127.0.0.1:17854/`；
- production gate 当前仍为 `DISABLED + []`。

### 限定

- 当前 9 个 E2E 是开发级 Chromium 主路径证据，不等于冻结的 194-case release catalog；
- 未执行 Firefox/WebKit release matrix、378-case visual、性能硬件矩阵、28 recovery case 和 6/12 clean smoke；
- 内置浏览器人工复核使用桌面 `1280x720`；`390x844` 无横向溢出和画布可达性来自 Playwright 自动化；
- `.opmp` 只有冻结设计，没有实现和 roundtrip 证据；
- 本结果不构成 GATE-06-02~06、96 Capability、`.opmp`、生产发布或 ISO 19450:2024 符合性证明。
