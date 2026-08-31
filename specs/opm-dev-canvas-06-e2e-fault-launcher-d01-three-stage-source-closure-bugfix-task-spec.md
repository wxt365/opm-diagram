# DEV-CANVAS-06 E2E Fault Launcher D01 三段 Source 闭包 Bugfix Task Spec

状态：`FROZEN / SUPERSEDED_BY_FINAL_PRODUCTION_SOURCE_CHAIN`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

活动后继：`opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`取代本文固定commit链及`2 A` delta。D01的三段逐parent复算原则和Preflight Report不新增字段继续有效；活动链改为`9048bb3... -> rebuilt Fault contract -> rebuilt schema conformance -> A`，`S -> A`固定为`4=2 M+2 A`。

## 1. 目标

修正 Fault Launcher 2A 的 `FLCP-D01-SOURCE` 父链冲突，使 D01 唯一验证以下四节点、三段 source 闭包：

```text
origin -> rejected contract candidate -> conformant contract base -> 2A candidate
```

本修正不增加或删除 Preflight Report `0.2` 字段，不升级 Schema，不实现或提交A代码；活动allowlist以后继规格的`4=2 M+2 A`为准。

## 2. 复现与 Root Cause

### 2.1 已复现事实

1. origin 固定为 `0dcaa27a92693feaf28b731ebed2f81a9ccea02c`；
2. 被拒 contract candidate 固定为 `63851f8878dcf6da86e99d5ffa7795ac48200920`，其唯一 parent 是 origin；
3. conformant contract base 固定为 `586d6dee1b07c6634267aeb344e8826adb1ddb4b`，其唯一 parent 是被拒 candidate；
4. Contract Base Schema Conformance 规格第 8 章要求第 3 项父关系；
5. 2A 实现规格第 4.2/8.4 节及 Preflight 闭包第 17.4 节仍要求 conformant contract base 的唯一 parent 直接等于 origin；
6. 因此 `586d6de...` 在旧 D01 下必然得到 `SOURCE_COMMIT_NOT_READY`，无法进入 READY。

### 2.2 Root Cause

2A 的 D01 在 schema-conformance 后继提交形成前冻结，只表达了 `origin -> contract -> 2A` 两段链。后续 `63851f8...` 被拒并要求以 `2 M` single-parent commit 修正，但 D01 没有同步增加中间的 rejected candidate 节点。

之前未被发现，是因为 2M 规格和 D01 分属两份活动规格，复核只分别验证了各自的直接 parent，没有对完整 Git 图做联合可满足性检查。

## 3. Fix Strategy

1. 保持 Preflight Report `0.2` 的 `origin_base_source_commit/contract_base_source_commit/candidate_source_commit` 三字段不变；
2. `contract_base_source_commit`等于A的唯一parent S；
3. D01从S的唯一parent推导C，再从C的唯一parent推导O；
4. O逐字符等于活动origin `9048bb355aff18d5c00fbbaeb1660b979f4e6daa`；
5. 分别验证`20=12 M+8 A`、`2 M`、`4=2 M+2 A`三段exact delta；
6. 不把C增加到Report，也不允许从commit message、branch、tag、目录名或历史位置推断。

## 4. 历史身份记录

下表只记录被后继Final Production Source Chain取代的历史链，不得用于活动Build、D01 READY或Report输入：

| 角色 | Exact commit | Tree | 唯一 parent | 状态 |
| --- | --- | --- | --- | --- |
| origin | `0dcaa27a92693feaf28b731ebed2f81a9ccea02c` | 由 Clean Base 闭包既有记录承接 | `e598b305a44ebb9c9845c1f5563bc36c3a89a2b4` | `READY/READ_ONLY` |
| rejected contract candidate | `63851f8878dcf6da86e99d5ffa7795ac48200920` | 既有候选记录承接 | origin | `REJECTED_AS_2A_CONTRACT_BASE` |
| conformant contract base | `586d6dee1b07c6634267aeb344e8826adb1ddb4b` | `1e8111b1ef53970bf450ba7f96c44e5a54f20e1e` | rejected contract candidate | `READY_AS_2A_CONTRACT_BASE` |
| 2A candidate | 由未来 clean 2A commit 产生 | 不预填 | conformant contract base | `NOT_CREATED` |

历史conformant contract base 的 committer epoch 固定为 `1787743172`，raw binary patch SHA-256 固定为：

```text
56138e19bd83241ffdd60bda3f156a3f9c0b768c6d083ea453893e428ce021e4
```

该 SHA 的唯一算法继续采用：

```text
SHA-256(raw stdout bytes of:
  git show --format= --no-ext-diff --binary 586d6dee1b07c6634267aeb344e8826adb1ddb4b)
```

## 5. D01 唯一校验算法

### 5.1 Git 读取规则

D01 只能在显式 `--source-root` 中使用 exact Git object database，所有 parent/delta 调用必须禁用 replace object，并禁止 rename 推断：

```text
git --no-replace-objects rev-parse HEAD
git --no-replace-objects rev-list --parents -n 1 <commit>
git --no-replace-objects diff --no-renames --name-status <from>..<to>
git status --porcelain=v1 --untracked-files=all
```

禁止 shallow 缺对象、replace/graft 语义、branch/tag 名称、commit message、abbrev SHA、GitHub ref、目录名、mtime、latest 或 fallback。任一 exact object 不可读、parent 数量不等于 1、输出不是完整 40 位小写 SHA，均为 D01 `MISMATCH/SOURCE_COMMIT_NOT_READY`。

### 5.2 四节点与三段 delta

按以下固定顺序校验：

```text
candidate = source HEAD
contract = onlyParent(candidate)
fault_contract = onlyParent(contract)
origin = onlyParent(fault_contract)

candidate == Preflight Report.candidate_source_commit
contract == Preflight Report.contract_base_source_commit
candidate == A
contract == S
fault_contract == C
origin == O == 9048bb355aff18d5c00fbbaeb1660b979f4e6daa

delta(origin, fault_contract) == exact 20=12 M+8 A
delta(fault_contract, contract) == exact 2 M
delta(contract, candidate) == exact 4=2 M+2 A
source porcelain == empty
```

三段 exact delta 分别为：

1. `O -> C`：逐项等于Final Production Source Chain第6章20个路径和状态；
2. `C -> S`：只允许：

```text
M docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json
M scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs
```

3. `S -> A`：只允许：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
```

只比较条目数量不合格；必须比较有序 `status + TAB + path` 数组，禁止 extra、missing、rename、copy、type-change 或同路径错误状态。

### 5.3 Report 与 dependency result

Preflight Report 保持：

```text
schema_id=OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-CONTROLLED-PREFLIGHT-001
schema_version=0.2
origin_base_source_commit=9048bb355aff18d5c00fbbaeb1660b979f4e6daa
contract_base_source_commit=<S完整40位SHA>
candidate_source_commit=<A完整40位SHA>
```

不新增中间Fault contract字段。D01通过`onlyParent(contract_base_source_commit)`取得C，并通过`onlyParent(C)`取得O；C是可复算Git图，不是Report新字段。

`implementation_delta`仍只表达`contract -> candidate`，但活动固定为四项`M/M/A/A`：`release-canvas06-e2e-run.mjs`、其测试、controlled Node owner、controlled Playwright spec。`baseline_raw_refs_sha256`仍表达origin的36项基线身份；其中两个Runner ref在A允许按delta变更，其余34项必须不变。D01的字段、detail code和evidence ref类型不变：成功为`READY/READY`，任一链、路径、状态、顺序或delta不闭合为`MISMATCH/SOURCE_COMMIT_NOT_READY`。

## 6. 历史2M接纳记录

`586d6de...`已满足：

1. single-parent 于 `63851f8...`；
2. delta 精确为第 5.2 节 `2 M`；
3. 12 项 contract raw ref 有序集合摘要为：

```text
contract_raw_refs_sha256
= SHA-256(RFC8785_JCS(Preflight闭包第13.2节顺序的12个{path,byte_length,sha256}))
= 8662b3bbd051a3f5756a28baa411149e64e2319d085cfe68479556af8bd5b1d9
```

4. Node `22.22.0` 定向 producer/verifier测试 `13/13 PASS`；
5. `npm run contract:validate` 在 Node `22.22.0` 下通过；
6. `git diff --check`通过，验证后 worktree porcelain为空。

12项逐文件raw ref由Contract Base Schema Conformance checklist的历史接纳记录承接。该接纳只证明旧链在当时闭合；`586d6de...`不得作为活动A的clean base，也不表示2A代码或受控执行完成。

## 7. 修改边界

本 bugfix 只允许修改设计、规格、checklist和索引状态：

```text
specs/opm-dev-canvas-06-e2e-fault-launcher-d01-three-stage-source-closure-bugfix-task-spec.md
docs/checklists/opm-dev-canvas-06-e2e-fault-launcher-d01-three-stage-source-closure-bugfix-checklist.md
specs/opm-dev-canvas-06-e2e-fault-launcher-contract-base-schema-conformance-bugfix-task-spec.md
docs/checklists/opm-dev-canvas-06-e2e-fault-launcher-contract-base-schema-conformance-bugfix-checklist.md
specs/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md
docs/checklists/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-checklist.md
specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md
docs/checklists/opm-dev-canvas-06-e2e-fault-launcher-implementation-checklist.md
docs/design/opm-dev-canvas-06-e2e-fault-launcher-design.md
docs/design/opm-test-strategy.md
docs/design/opm-development-execution-pack.md
docs/design/opm-design-freeze-baseline.md
docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md
docs/README.md
```

禁止修改 2A 两个未提交文件、12 项 contract bytes、36 项 baseline、任何 Schema、package.json、Java、Runner、Manifest、Report、OpenAPI、SQLite DDL、production配置和release root。

## 8. 验收矩阵

1. 正例：活动`O -> C -> S -> A`三段exact delta、A=`2 M+2 A`且clean source，D01为READY；
2. contract 直接 parent=origin：拒绝，不能跳过 rejected candidate；
3. contract parent不是`63851f8...`：拒绝；
4. rejected parent不是origin、merge commit、missing object或replace object：拒绝；
5. 任一段只有数量相等但路径/状态不同：拒绝；
6. candidate从`63851f8...`或origin直接产生：拒绝；
7. candidate parent正确但tracked/untracked dirty：拒绝；
8. Report把`63851f8...`写入`contract_base_source_commit`：拒绝；
9. Report新增 rejected 字段、升级版本或修改payload摘要算法：拒绝；
10. D01 READY不得推导D02~D10A、Playwright、evidence或Gate READY。
11. A只含两个新增文件、两个Runner文件仍等于S、四项次序或expected status错误：拒绝；
12. controlled新增文件复制Runner业务语义而不是调用已修改owner：拒绝。

## 9. 回滚、风险与非结论

设计回滚只撤销本规格及第7章状态同步，不删除或改写 `0dcaa27...`、`63851f8...`、`586d6de...`、当前2A失败现场或用户资产。`586d6de...`已作为不可变contract base存在，禁止amend；后续缺陷必须新增bugfix commit。

事实：三项历史commit及其parent关系可由Git对象复算；`586d6de...`的2M定向测试、contract validate和clean检查属于历史接纳证据。活动C/S/A均未创建，未形成受控Playwright或evidence。

非结论：本规格冻结和2M base接纳不等于2A实现、D01实际READY、Controlled Playwright、production `194/388`、E2E Report、GATE-06-03、Candidate、Activation、Capability、production发布或ISO符合性证明。
