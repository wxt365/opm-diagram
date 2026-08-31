# DEV-CANVAS-06 E2E Fault Launcher Contract Base Schema Conformance Bugfix Task Spec

状态：`IMPLEMENTED / HISTORICAL_READY_NOT_CONSUMABLE`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

活动后继：`opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`要求在`9048bb3...`新origin后重建Fault contract与本`2 M` Schema conformance stage。`63851f8.../586d6de...`及其既有patch记录只保留为历史语义与raw-patch对照，不得直接供新2A消费；新Stage S必须以新Stage C为唯一parent并重新接纳。

## 1. 目标

修正候选contract commit `63851f8878dcf6da86e99d5ffa7795ac48200920`中的Gate Observation Schema，使其逐字段承接活动Fault Launcher设计已经冻结的两条分支：

1. `PASS_MATCHED`必须恰有`12`项DURING、零mutation、空failures；
2. `FAILED`只能保留真实`0..12`项DURING有序前缀，必须有failure，并区分Gate mutation与非Gate Playwright执行失败。

本包只修正contract base，不实现2A controlled CLI、Preflight Report `0.2`、Invocation Context、Playwright执行或evidence事务。

## 2. 复现与Root Cause

### 2.1 已复现事实

1. `63851f8...`中的`opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json`把`during`固定为`minItems=12/maxItems=12`，对`PASS_MATCHED/FAILED`没有条件分支；
2. `failure.code`只接受`PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN`，无法表达`CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED`；
3. contract测试只有PASS对象与unknown-field负例，没有FAILED前缀、failure条件或首错类型正反例；
4. 未提交2A owner的`buildGateObservation()`同样拒绝任何非12项DURING，因此不能在2A内部绕过Schema缺陷；
5. Node 22定向测试虽为`4/4 PASS`，只证明旧局部行为；Playwright `--list`对历史spec返回`0 tests in 0 files`，不构成controlled执行证据。

### 2.2 Root Cause

contract实现依据早期“成功固定14项”口径生成Schema，没有同步后继设计已经冻结的“提前失败只记录真实前缀”条件分支。Schema和contract测试均位于2A只读base；若让2A自行放宽或复制验证，会违反精确allowlist与单一Schema owner约束。

之前未被发现，是因为contract测试只覆盖PASS和额外字段，没有以FAILED对象对Schema做条件分支验证。

## 3. 权威输入

1. 活动语义：`specs/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md`第11、17章；
2. 2A边界：`specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`；
3. 缺陷base：`63851f8878dcf6da86e99d5ffa7795ac48200920`，其parent必须为`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`；
4. Gate Observation identity保持`OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-GATE-OBSERVATION-001/0.1`，本包不升级Schema版本或文件名。

`63851f8...`固定状态为`REJECTED_AS_2A_CONTRACT_BASE/SCHEMA_CONFORMANCE_DEFECT`，不得作为2A final commit的parent。

## 4. 精确修改边界

唯一source delta为`2 M`：

```text
M docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json
M scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs
```

其余`63851f8...`的10项contract delta、36项Fault Launcher baseline、`package.json`、Runner、Playwright config、Manifest、Report、公共Schema、Java、OpenAPI、SQLite DDL、production配置和全部release root均只读。禁止把两个未提交2A文件、临时测试helper或第三个Schema加入本包。

若上述两个文件之外存在任何tracked/untracked变化，必须停止并输出`FAULT_LAUNCHER_CONTRACT_BASE_DELTA_INVALID`，不得扩大本规格。

## 5. Gate Observation Schema唯一修正

### 5.1 公共字段保持不变

顶层required、`additionalProperties=false`、identity、Descriptor/File ref、snapshot字段、digest和时间格式保持不变。`before/after`仍各恰一项；`during[]`item仍使用封闭`duringSnapshot`。

### 5.2 条件分支

顶层`during`基础范围改为`minItems=0/maxItems=12`，随后以Draft 2020-12 `allOf`中的两个互斥`if/then`冻结：

```text
if observation_status == PASS_MATCHED:
  during minItems=12, maxItems=12
  production_gate_mutation_count == 0
  failures maxItems=0

if observation_status == FAILED:
  during minItems=0, maxItems=12
  failures minItems=1
```

`observation_status`仍只允许`PASS_MATCHED|FAILED`。不得通过第三种状态表达基础设施失败；无法形成Schema-valid Artifact或AFTER时仍属于`EVIDENCE_TRANSACTION/4`。

### 5.3 failure封闭语义

`failure.code`唯一枚举为：

```text
PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN
CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED
```

`phase`仍为`BEFORE|DURING|AFTER`。Schema必须以条件分支约束：

1. `phase=DURING`时，`schedule_id`必须匹配`^FL-SCH-0[1-6]$`，`process_cycle`必须为`INITIAL|REOPEN`；
2. `phase=BEFORE|AFTER`时，`schedule_id/process_cycle`必须显式为JSON `null`；
3. `evidence_refs`保持封闭file-ref数组；
4. failure对象继续`additionalProperties=false`。

DURING是否为Descriptor调度的连续真实前缀、first failure与mutation count的跨项关系由2A只读semantic verifier复核，不能仅依赖JSON Schema，也不能由Schema重新排序数组。

## 6. Contract测试矩阵

现有contract测试文件必须至少固定以下`10`项：

| ID | 对象 | 预期 |
| --- | --- | --- |
| `FLCB-P-001` | PASS、12 DURING、mutation=0、failures=[] | Schema PASS |
| `FLCB-P-002` | FAILED、3项真实DURING前缀、Gate mutation failure | Schema PASS |
| `FLCB-P-003` | FAILED、0项DURING、BEFORE Playwright execution failure | Schema PASS |
| `FLCB-N-001` | PASS只有11项DURING | Schema FAIL |
| `FLCB-N-002` | PASS含failure | Schema FAIL |
| `FLCB-N-003` | PASS mutation非0 | Schema FAIL |
| `FLCB-N-004` | FAILED但failures=[] | Schema FAIL |
| `FLCB-N-005` | failure code不在两项枚举 | Schema FAIL |
| `FLCB-N-006` | DURING failure的schedule/cycle为null | Schema FAIL |
| `FLCB-N-007` | BEFORE/AFTER failure携带非null schedule/cycle或extra字段 | Schema FAIL |

测试对象必须每次fresh构造，禁止一个负例的mutation污染后续case。所有正例还必须复算`observation_payload_sha256`；Schema shape通过不能替代2A semantic verifier。

## 7. 实现与验证命令

必须使用本机Node `22.22.0`精确可执行文件或等价受控Node 22，不要求Node 24：

```text
/Users/xiaotaowang/.nvm/versions/node/v22.22.0/bin/node --test \
  scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs \
  scripts/verify-canvas06-e2e-fault-launcher-preflight-input.test.mjs

npm run contract:validate
git diff --check
```

还必须执行只读source检查：

```text
git diff --name-status 63851f8878dcf6da86e99d5ffa7795ac48200920..<candidate>
git status --porcelain=v1 --untracked-files=all
```

候选commit前一条命令必须逐行等于第4章`2 M`；commit后worktree必须为空。

## 8. 新Contract Base接纳

新contract base必须：

1. 是single-parent commit，parent逐字符等于`63851f8878dcf6da86e99d5ffa7795ac48200920`；
2. source delta逐项等于`2 M`，无extra；
3. 记录完整40位commit、tree、committer epoch和`SHA-256(git show --format= --no-ext-diff --binary <commit> raw stdout)`；
4. 第6、7章全部通过，Node版本和命令进入接纳记录；
5. 从origin `0dcaa27...`比较时，逻辑路径集合仍恰为原contract `12=4 M+8 A`，但必须重新记录12项raw ref及有序集合摘要，禁止复用`63851f8...`的bytes或patch SHA；
6. checklist状态由`CANDIDATE`提升为`READY_AS_2A_CONTRACT_BASE`后，才允许2A从该commit创建fresh clean worktree。

以上条件已由`586d6dee1b07c6634267aeb344e8826adb1ddb4b`满足。其tree、parent、epoch、raw binary patch SHA、12项raw ref与集合摘要、Node `22.22.0`测试命令和clean porcelain记录由对应checklist与D01三段Source闭包规格承接；该commit固定为不可变`READY_AS_2A_CONTRACT_BASE`，禁止amend。

## 9. 历史2A恢复条件与活动取代

以下两个新增路径继续作为controlled逻辑来源：

```text
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
```

该历史`2 A`恢复条件已被Final Production Source Chain取代。活动A必须以新S为唯一parent，source delta固定为`4=2 M+2 A`，另含两个Runner `M`；不得从`586d6de...`直接提交。

现有`/private/tmp/opm-dev-canvas-06-fault-launcher-2a`中的两个未跟踪文件基于被拒绝base且使用历史spec文件名，只能作为失败现场；禁止直接提交、amend、移动为新base产物或声明测试证据。`/private/tmp/opm-dev-canvas-06-fault-launcher-2a-v2`已以`586d6de...`为HEAD，但其中两个文件仍为未提交局部实现；D01三段父链必须先按独立后继修正规格冻结并实现，才能形成2A final commit。

## 10. 回滚、事实与非结论

回滚只撤销本包`2 M`的未接纳候选，不删除`63851f8...`或失败现场。新base一旦作为不可变输入接纳，不允许amend；后续缺陷必须新建bugfix commit和接纳记录。

事实：`63851f8...`的12项contract实现存在，但Gate Observation Schema不满足活动FAILED分支，因而继续固定为被拒候选。其single-parent后继`586d6de...`已完成exact`2 M`，Node `22.22.0`定向测试`13/13 PASS`、`contract:validate`与clean检查通过，已接纳为2A contract base。当前2A v2 worktree只有两个未提交文件，尚无2A final commit、真实controlled evidence或Gate完成。

非结论：`2 M`实现和新base接纳不等于2A、Invocation Context、controlled Playwright、`194/388`、GATE-06-03、Candidate、Activation、Capability、production或ISO证据完成。
