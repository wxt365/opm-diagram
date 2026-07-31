# OPM 当前实现与冻结设计符合性验收报告

报告版本：`1.0`

验收日期：`2026-07-30`

总体状态：`FAIL / NOT_READY_FOR_RELEASE`

## 1. 结论

当前实现**不完全符合已冻结设计，不能进入发布或生产 enablement**。

后端语义、OPL/Trace/Golden、Revision 0.1/0.2 compatibility、SQLite 原子提交和工程单测已经形成较强的可执行证据；但用户主路径存在 P0 阻断：前端固定发送 Profile `0.1.0`，当前 Runtime 固定要求 `0.2.0`。模型创建以及所有编辑命令均返回 `RULE_VERSION_CONFLICT`，导致 P03 在线编辑、State、16/8/10 关系、Control、Structural fan、OPL/Trace 实时闭环无法完成。

DEV-CANVAS-05 的 6 项机器 evidence 均为 `MATCHED`，但正式 handoff 仍为 `BLOCKED`，34 个 Capability 全部为 `BLOCKED`；DEV-CANVAS-06 的 Intake、378-case visual、194-case E2E、performance、recovery、release candidate 和 activation 可执行闭包未实现。

本结论不否定设计冻结，也不否定后端 Golden 证据。它只说明“当前候选实现整体符合设计”这一验收目标未达到。

## 2. 验收边界

- 顶层基线：`docs/design/opm-design-freeze-baseline.md`、`docs/design/opm-development-execution-pack.md`；
- 测试基线：`docs/design/opm-test-strategy.md`；
- 完整画布：DEV-CANVAS-00~06 规格和 checklist；
- 只测试和审计，不修改业务源码、测试、契约、Profile、Golden、配置或依赖；
- `FROZEN_DEFERRED` 不要求实现，但禁止错误宣称为已实现或符合；
- 状态定义遵循本任务规格：`PASS / FAIL / BLOCKED / NOT_RUN / NOT_APPLICABLE`。

## 3. 测试环境

| 项目 | 实际值 |
| --- | --- |
| OS/架构 | macOS arm64 |
| Node/npm | Node `22.22.0` / npm `10.9.4` |
| Java | GraalVM JDK `21.0.7`；默认 shell 的 JDK 17 被工程 Enforcer 正确拒绝 |
| 前端 | Vue `3.5.26`、Vite `7.2.2`、X6 `2.18.1` |
| E2E | Playwright `1.57.0`，Chromium，`workers=1` |
| 浏览器人工验收 | 当前 JAR `127.0.0.1:17853` + 当前 Vite `127.0.0.1:5177`，隔离存储根 |

## 4. 关键发现

### `P0-01` 前后端 Profile binding 不一致，在线建模主路径不可用

状态：`FAIL`

直接证据：

1. `apps/web/src/shared/api/localRuntimeApi.ts:283` 的 `defaultBinding()` 固定 `profile_version="0.1.0"`；模型创建、编辑、校验均复用该 binding；
2. `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java:50` 固定 `PROFILE_VERSION="0.2.0"`；第 1430 行不一致即返回 `RULE_VERSION_CONFLICT`；
3. Playwright 8 个场景全部在 OV02 后失败，统一错误为“Profile 或 Rule 版本不匹配”，`p03-workbench` 未出现；
4. 浏览器人工验收复现同一错误。使用 0.2 binding 直接创建隔离模型后可打开 P03，但点击“创建 Object”仍因前端命令继续发送 0.1 binding 而失败，画布保持 0 node/0 edge。

影响：P01 项目创建可用，但 P02 -> P03、Object/Process/State、所有关系、实时 OPL/Trace 和重开主路径不可验收。该问题使 DEV-CANVAS-00~04 的产品端到端 Gate 全部失败。

### `P0-02` DEV-CANVAS-05 handoff 未打开，DEV-CANVAS-06 未实现

状态：`FAIL`

直接证据：

- Golden/Trace 六项 Gate evidence 均 `MATCHED`；
- handoff Schema 校验通过，16 个内部 ref 的 byte length/SHA-256 全匹配；
- handoff 状态为 `BLOCKED`，34 个 Capability eligibility 全部 `BLOCKED`；
- blockers 为 `SOURCE_BUILD_DIRTY`、`RELEASE_ARTIFACTS_MISSING`，`build_artifacts=[]`；
- `production_gate={state:"DISABLED",enabled_capability_ids:[]}`；
- 在 `apps/services/scripts/tests/packages/package.json` 未找到 DEV-CANVAS-06 Intake、Enablement、Visual、Performance、Recovery、Release Candidate 或 Activation 可执行入口。

影响：即使后端 178-case Golden 通过，也不能进入 DEV-CANVAS-06，更不能启用生产 Capability。

### `P1-01` 当前 E2E 不是冻结的 release catalog，且现有 8 个场景全部失败

状态：`FAIL`

当前只有 `tests/e2e/workbench-layout.spec.ts` 的 8 个顶层场景，使用 Vite dev server。冻结设计要求 194 个 release E2E case、388 次隔离 attempt，以及 production build、固定环境和机器报告。当前还缺 378 个 visual case、性能 `4 fixture / 7 scenario / 11 metric instance`、28 个 recovery case 和 release candidate smoke。

影响：不能从前端单测 `38/38` 或后端 `231/231` 推导浏览器/发布符合。

### `P1-02` 两配置档 96 Capability 宇宙没有机器闭包

状态：`FAIL`

当前 0.1.0 和 0.2.0 ISO Profile package 各登记 38 个唯一 Capability；未发现第二配置档或 96 项唯一登记的可执行验证入口。完整 ISO/中文专属 Profile 又明确属于延期范围，因此当前实现不能声称 DFR-007 已完成。

### `P1-03` `.opmp` 原生交换只有设计契约，没有实现与往返证据

状态：`FAIL`

仓库仅找到 `docs/design/opm-native-exchange-package-contract.md`，未找到 `.opmp` staging/import/export 实现、测试或 roundtrip 产物。

## 5. 自动化结果

| 验证 | 结果 | 证据摘要 |
| --- | --- | --- |
| `npm run contract:validate` | `PASS` | OpenAPI、generated DTO、Schema 样例和 API-EDT contract 有效 |
| `npm run golden:contract:test` | `PASS` | 25/25；16 个 mutation、coverage catalog、Atomic 输入守卫通过 |
| `npm run golden:check` | `PASS` | 178 cases 结构有效 |
| `npm run golden:coverage` | `PASS` | 178 cases EXACT，无历史 32 项缺口 |
| `npm run golden:replay` | `PASS` | 178 = 130 PASS + 48 预期 BLOCKED，失败 0；两次 replay；260 个 committed Revision attempts 通过 Schema |
| `npm run compatibility:replay` | `PASS` | 13 = 6 PASS + 7 预期 BLOCKED，失败 0 |
| `npm run handoff:evidence` | `PASS` | GATE-05-01/04 `MATCHED`；不改变 handoff 的整体 `BLOCKED` 状态 |
| `npm run lint` | `PASS` | 0 warning/error |
| `npm run typecheck` | `PASS` | vue-tsc 通过 |
| 前端 Vitest | `PASS` | 7 files，38/38 |
| `npm run build` | `PASS_WITH_WARNING` | 构建成功；主 JS 643.26 kB；`opm-bootstrap.js` 非 module 警告 |
| `npm run backend:verify` | `PASS` | 21 test files，231/231，failure/error/skipped 均 0 |
| `npm run test:e2e` | `FAIL` | 8/8 失败，统一阻断于模型创建 binding conflict |

## 6. `FROZEN_INCLUDED` 符合性矩阵

| ID | 状态 | 结论与证据 |
| --- | --- | --- |
| `DFR-001` | `PASS` | 单机、loopback、local session 与隔离本地存储边界成立 |
| `DFR-002` | `FAIL` | DEV-CANVAS-05 handoff blocked，DEV-CANVAS-06 未闭环 |
| `DFR-003` | `FAIL` | P01 可用；P02 模型创建阻断；P03 主路径 8/8 E2E 失败 |
| `DFR-004` | `FAIL` | 图标壳可见，State/16/8/10 在线命令因 binding conflict 不可用 |
| `DFR-005` | `FAIL` | 100% -> 90% 缩放保持 Revision，390x844 无全局横向溢出；25/100/400 visual 和跨浏览器矩阵缺失 |
| `DFR-006` | `PASS` | 语义验证、Golden、compatibility、Revision/SQLite 单测通过 |
| `DFR-007` | `FAIL` | 当前机器 Profile 每版 38 项，未形成两配置档 96 项唯一登记与隔离证据 |
| `DFR-008` | `PASS` | Clause 1~14/Annex 边界和 `EVIDENCE_MISSING` 声明守卫保持；未误称 Clause 15 |
| `DFR-009` | `FAIL` | 34 Capability Golden 通过，但在线候选/提交端到端失败 |
| `DFR-010` | `FAIL` | 基础 Fact + Control pair 的 Golden/roundtrip 通过，在线 Control 端到端失败 |
| `DFR-011` | `FAIL` | Structural fan/方向/完整性 Golden 通过，在线端到端失败 |
| `DFR-012` | `PASS` | 178 semantic + 19 Atomic、Token/Trace/digest/replay 机器证据通过 |
| `DFR-013` | `FAIL` | 后端幂等/事务测试通过，但应用命令 binding 契约前后端冲突 |
| `DFR-014` | `PASS` | OpenAPI 0.2 draft、generated TS/Java DTO 和 contract test 当前一致 |
| `DFR-015` | `PASS` | 0.1/0.2 reader/writer/roundtrip compatibility 13/13 matched |
| `DFR-016` | `PASS` | SQLite V1、迁移、不可变/原子提交和重开相关测试通过 |
| `DFR-017` | `FAIL` | `.opmp` 只有设计，无实现/测试/往返证据 |
| `DFR-018` | `FAIL` | 单元与 Golden 层通过，visual/E2E/performance/recovery 发布证据不完整 |
| `DFR-019` | `FAIL` | DEV-CANVAS-06 机器闭包缺失，production gate 保持 disabled |
| `DFR-020` | `PASS` | 设计冻结、正式索引和 handoff 状态未被错误外推为发布/ISO 通过 |

汇总：`PASS=8`，`FAIL=12`，`BLOCKED=0`，`NOT_RUN=0`。其中多个 FAIL 含后端局部 PASS，但产品责任必须按端到端退出条件判定。

## 7. `FROZEN_DEFERRED` 边界

10 项延期责任均未发现越界生产声明：P04-P06、中文专属 Profile、OPL 直接编辑、约 511 原子规则、完整 Annex A Grammar、完整 Clause 4 Symbol Catalog、ISO 符合性声明、外部工具互操作、静态加密/涉密、远程协同/跨平台支持仍保持非目标。

因此 ISO 19450:2024 结论继续为：`EVIDENCE_MISSING / 无法判断`，不是“不符合”，也不是“部分符合”。

## 8. 修复与重验顺序

1. `P0`：统一前端 `defaultBinding()` 与 Runtime active Profile binding，禁止再次硬编码双源；补模型创建和编辑命令的真实 0.2 contract/E2E；
2. `P0`：重跑 8 个现有 E2E，必须先达到 8/8 PASS，再讨论扩大覆盖；
3. `P0`：在 clean source build 中产出至少两个 release artifacts，重新生成 DEV-CANVAS-05 handoff，使 34 项达到 `ELIGIBLE_FOR_RELEASE_VALIDATION`；
4. `P1`：实现 DEV-CANVAS-06 Intake -> Visual/E2E/Performance/Recovery -> Candidate -> RC -> Activation 全部机器 Schema、runner、manifest 和 report；
5. `P1`：补齐两配置档 96 Capability registry/isolation 和 `.opmp` 实现范围，或通过新规格明确从当前实现基线延期；
6. 完成以上后再执行本报告同一命令矩阵和浏览器验收，不能只回归失败的单点。

## 9. 事实与限定

### 事实

- 本报告中的 PASS/FAIL 均来自本次实际命令、机器报告、源码调用链或当前浏览器行为；
- 测试使用当前未提交工作树，未把 Git commit 视为当前候选实现；
- 本任务只新增验收规格、checklist 和报告，没有修复业务代码；
- 浏览器隔离页面为 `http://127.0.0.1:5177/`，当前保留用于复核。

### 限定

- 未执行 DEV-CANVAS-06 性能硬件矩阵，因为对应 runner、fixture 和机器报告闭包不存在；
- 未执行 Firefox/WebKit release matrix；当前 Chromium 主路径已在前置 binding conflict 失败；
- 未运行会重写用户 handoff 资产的 `npm run handoff:check`，改为只读校验现有 handoff Schema、计数和全部 16 个内部 ref 的 SHA/长度；
- 没有对 ISO 19450:2024 作符合/不符合判定。
