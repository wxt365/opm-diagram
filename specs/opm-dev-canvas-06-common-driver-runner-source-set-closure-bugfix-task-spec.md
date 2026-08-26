# Spec: DEV-CANVAS-06 Common Driver编排与Runner Source Set闭包修正

文档状态：`FROZEN`

设计修正状态：`COMPLETE`

实现准入：`EMBEDDED_IN_17_PATH_INTEGRATED_SOURCE/NOT_STANDALONE`

活动后继：`opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与最小复现

活动Common Driver实现规格要求新增：

```text
scripts/canvas06-e2e-controlled-orchestration.mjs
scripts/canvas06-e2e-controlled-orchestration.test.mjs
```

但活动Runner Source Set `OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001/0.1/0.1.0`使用固定23项`prefixItems`，并以`ALL_PATHS_NOT_IN_ENTRIES`排除未列文件。上述production编排owner不在23项中，因此它即使实现，也不能进入活动Report `0.2`的`runner_source_sha256`身份。

最小复现条件：按原18路径allowlist实现独立编排文件，再按Runner规格生成`runner-source-set.json`。Schema必须排除该文件，导致Report不能证明实际执行编排逻辑的source bytes，活动实现规格与机器身份不可同时满足。

## 2. Root Cause

### 2.1 问题原因

Common编排规格在冻结实现文件时只考虑了职责拆分，没有与已冻结的Runner Source Set精确allowlist做反向闭包检查，形成“运行时会调用但证据身份排除”的第二个production owner。

### 2.2 为什么之前未被发现

原检查覆盖了Common Driver raw ref、Manifest第四driver和Report版本，但没有把新增编排文件逐项投影到Source Set `0.1`的23项`prefixItems`与`excluded_classes`。

## 3. Fix Strategy

### 3.1 唯一决定

采用最小修正，不升级Runner Source Set：

1. `prepareControlledAttempt()`与全部controlled attempt production编排唯一收敛到已列入Source Set第1项的`scripts/release-canvas06-e2e-run.mjs`；
2. 编排单元/契约测试收敛到`scripts/release-canvas06-e2e-run.test.mjs`；
3. 不创建`canvas06-e2e-controlled-orchestration.mjs`及其测试；
4. Runner Source Set继续保持`0.1/0.1.0`、固定23项；
5. 活动E2E Report继续保持`0.2`、`runner_version=0.2.0`；
6. 实际Runner文件bytes变化由既有23项raw ref和`source_set_sha256`自然承接，不新增或重解释摘要公式。

不选择Source Set `0.2`。该方案会连带升级Schema、Report identity、producer/verifier、parity vector和历史兼容边界，超出“单一Runner内部编排owner冲突”的最小修复范围。

### 3.2 已存在能力的只读边界

以下能力已经存在，本后继实现包只读消费，不重复修改：

- `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs`及其测试；
- `WorkbenchView.vue`中的`p03-state-inspector`、`p03-state-inspector-name`、`p03-fact-delete-impact`；
- Fact删除入口及现有`workbenchRuntime`状态机；
- `common-fixture-factory.mjs`及其测试；
- Runner Source Set Schema `0.1`与E2E Report Schema `0.2`。

已有能力的业务正确性仍由既有测试和后续controlled执行验证；“只读”不把局部实现状态提升为Report或Gate证据。

## 4. 后继实现精确边界

### 4.1 非文档allowlist：`8=7 M+1 A`

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-e2e-run-input.mjs
M scripts/canvas06-e2e-run-input.test.mjs
M scripts/canvas06-e2e-attempt-artifacts.mjs
M scripts/canvas06-e2e-attempt-artifacts.test.mjs
M tests/e2e/release/dev-canvas-06/playwright.release.config.ts
A tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts
```

前七个路径必须已由base source跟踪；最后一个路径必须在base source中不存在。实现commit相对其任务另行冻结的exact clean base只能出现这八个非文档路径，状态计数必须逐字符等于`7 M+1 A`。

### 4.2 Source Set与测试排除集

上述allowlist中进入production Runner Source Set的路径只允许：

```text
scripts/release-canvas06-e2e-run.mjs
scripts/canvas06-e2e-run-input.mjs
scripts/canvas06-e2e-attempt-artifacts.mjs
tests/e2e/release/dev-canvas-06/playwright.release.config.ts
```

其余四个测试路径继续属于Source Set `excluded_classes`，不得进入production identity。测试源不进入Report身份不表示可以不验证；它们必须由exact source commit和实现任务的test command记录。

## 5. Owner与调用边界

| 责任 | 唯一owner | 禁止 |
| --- | --- | --- |
| CLI、case循环、`prepareControlledAttempt()`、进程与端口生命周期 | `release-canvas06-e2e-run.mjs` | 动态导入Source Set外production helper、第二编排CLI |
| Manifest/Profile/driver raw join | `canvas06-e2e-run-input.mjs` | checkout fallback、调用上游producer/verifier替代共享owner |
| Attempt artifact写入、摘要与闭包复核 | `canvas06-e2e-attempt-artifacts.mjs` | 第二artifact writer、占位证据 |
| production Web/Runtime/Chromium测试配置 | `playwright.release.config.ts` | Vite/HMR、复用开发server |
| 16项浏览器受控验收 | `common-driver.controlled.spec.ts` | 重复定义`COMMON_CASES`、重写selector或业务期望 |

`release-canvas06-e2e-run.mjs`可以直接导入23项Source Set中的既有owner，但不得通过动态路径、目录扫描或未列helper扩展production执行图。`prepareControlledAttempt()`保持主设计冻结的签名、顺序、失败事务和稳定错误码。

## 6. 设计文档修改边界

本设计修正包只允许修改或新增以下12份文档：

1. 本规格；
2. 对应checklist；
3. Common Driver/受控编排主设计；
4. 原Common Driver实现规格；
5. 原Common Driver实现checklist；
6. E2E Runner实现规格；
7. E2E Runner实现checklist；
8. Toolchain release checklist；
9. 测试策略；
10. 开发执行包；
11. 全量设计冻结基线；
12. `docs/README.md`。

禁止修改`.harness/**`、任何代码、测试、Schema、OpenAPI、SQLite DDL、Profile/Rule/Grammar/Symbol、Handoff、Intake、release root或Git历史。

## 7. 验收与验证

### 7.1 设计闭包验收

1. 活动Common设计只声明一个production编排owner：`release-canvas06-e2e-run.mjs`；
2. 活动实现allowlist精确为`8=7 M+1 A`；
3. 活动文档不再要求创建独立controlled orchestration脚本；
4. Source Set保持`0.1/0.1.0`和23项，Report保持`0.2/0.2.0`；
5. Driver/UI/store/factory及两个活动Schema明确只读；
6. Runner、工具链、测试策略、执行包、README与冻结基线采用同一owner和状态口径；
7. `blocked/unresolved/cross_document_conflict=0`后才恢复该切片`READY_FOR_BUILD`。

### 7.2 文档验证命令

```text
rg -n "canvas06-e2e-controlled-orchestration" docs specs
rg -n "8=7 M\+1 A|0\.1/0\.1\.0|23项|runner_version=0\.2\.0" docs specs
node --test --test-name-pattern="E2E Runner Source Set" scripts/validate-canvas06-visual-e2e-schemas.test.mjs
git diff --check
```

本设计修正不执行应用、浏览器或release测试；Schema定向测试只确认既有Source Set机器契约未被文档修正破坏，不构成Runner实现或Report证据。

## 8. 回滚

回滚本规格/checklist及同步文档，将Common编排切片重新置为`BLOCKED_BY_RUNNER_SOURCE_IDENTITY_CONFLICT`。不得恢复原18路径实现准入，不得通过默认include、glob、忽略Source Set或伪造`runner_source_sha256`绕过冲突。

## 9. 事实与限定

### 9.1 事实

1. Source Set `0.1` Schema固定23项并排除全部未列文件；
2. `release-canvas06-e2e-run.mjs`、`canvas06-e2e-run-input.mjs`、`canvas06-e2e-attempt-artifacts.mjs`、`playwright.release.config.ts`已在该23项中；
3. Common Driver、三个selector和Fact删除入口已经存在；
4. 独立controlled orchestration脚本及controlled浏览器spec当前不存在；
5. 本修正不生成Manifest、Attempt、Report、Gate、Candidate、Activation、Capability、production或ISO证据。

### 9.2 假设/后继输入

本规格的owner、Source Set、`8=7 M+1 A`职责子集和只读边界继续有效，但不得独立形成source commit。活动后继已将唯一base固定为`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`，并把本8项与External Store 9项合并为一次提交的`17=14 M+3 A`。最终commit、Runtime JAR、production Web、controlled Manifest和fresh attempt root尚未生成。
