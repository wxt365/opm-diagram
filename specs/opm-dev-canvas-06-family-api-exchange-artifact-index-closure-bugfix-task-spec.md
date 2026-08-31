# DEV-CANVAS-06 Family API Exchange 与 Artifact Index Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Family Controlled Invocation 写入单条 API Exchange、raw request/response 后，与 Attempt Artifact `0.2` 的 Artifact Index writer/verifier 不可同时成立的问题。

本修正保持 Manifest `0.2`、Attempt Artifact `0.2`、Report `0.2`和Runner Source Set `0.2/24` identity不变；历史 `0.1`只读。

## 2. 已复现事实与 Root Cause

1. Attempt Artifact `0.2` Schema 对`artifact-index.refs`只规定`minItems=16`，并允许动态`API_REQUEST_BODY/API_RESPONSE_BODY/STDOUT_LOG/STDERR_LOG/FAILURE_ARTIFACT`；writer和活动Report verifier却错误要求恰16项。
2. Controlled Invocation已冻结每次真实exchange写独立canonical document并返回`exchange_ref`，但Schema没有`API_EXCHANGE` kind，`apiExchange`对象也没有`exchange_ref`，因此candidate、SETUP与subject证据不能从receipt闭合到Index。
3. `prepareControlledAttempt()`必须在attempt root保留`inputs/**`，Materializer与REOPEN verifier必须保留`storage/**`；writer递归把这些专用验证的运行支持文件当作未索引证据拒绝。

此前未发现，是因为Schema正例只构造16项最小集合，writer测试只加入一个无命名空间的extra文件，尚未把真实Materializer输入、SQLite和Family raw exchange同时放入同一attempt root。

## 3. 唯一修正

### 3.1 Schema与单条Exchange

活动`opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json`保持`schema_version=0.2`，只做未发布活动契约的闭包修正：

1. `artifactEntry.kind`增加`API_EXCHANGE`；
2. `apiExchange.required`增加`exchange_ref`；
3. `apiExchange.exchange_ref`固定为非空file ref；
4. 单条exchange canonical文件只包含既有八字段`sequence/operation_id/method/normalized_url/request_ref/response_ref/status/revision`，不包含自身ref，避免自摘要循环；
5. producer写完该文件后计算`exchange_ref`，再把九字段exchange对象写入`api-exchanges/index.json`；`exchange_set_sha256`对含`exchange_ref`的有序数组计算；
6. `exchange_ref.kind=API_EXCHANGE`，path固定`api-exchanges/exchange-<六位sequence>.json`，其raw SHA必须等于八字段canonical文件bytes。

### 3.2 Artifact Index集合

`refs[]`不是恰16项，而是：

```text
required minimum = 10 core + 1 PROFILE_ASSET_TREE + 5 PROFILE_ASSET
dynamic = every API_EXCHANGE/API_REQUEST_BODY/API_RESPONSE_BODY/
          STDOUT_LOG/STDERR_LOG/FAILURE_ARTIFACT evidence file
```

十类core、Profile tree和五类Profile asset仍各恰一次；动态项按实际文件零到多项。全部refs按UTF-8 path bytes严格升序，path唯一，`tree_sha256=SHA-256(JCS(refs))`。

Artifact Index覆盖attempt root中除自身外的全部证据文件。只有以下两个运行支持树不进入Index：

```text
inputs/**
storage/**
```

`inputs/**`只由Manifest/Runner Source Set/JAR/Web/Profile/fixture/input/binding raw ref专用校验负责；`storage/**`只由Materialization storage ref、SQLite只读完整性和REOPEN校验负责。两者不得被其他artifact当作`artifact_refs`，也不得放置API、日志或failure证据。除这两个前缀外，任何普通文件未索引、索引不存在文件、extra ref、链接或特殊文件均固定`E2E_INPUT_INVALID/2`。

### 3.3 Writer与Verifier

1. writer接收16项必需entry及所有动态entry，读取实际bytes后按UTF-8 path bytes排序；
2. writer递归检查attempt root，精确跳过`inputs/**`与`storage/**`，其余文件必须与refs一一对应；
3. verifier复算同一集合，验证每个API Exchange Index entry的`exchange_ref/request_ref/response_ref`均在Artifact Index唯一命中；
4. `API_EXCHANGE`只能位于`api-exchanges/`，media type固定`application/json`、phase固定`ACTION`、required固定`true`；
5. request/response body同样只能位于`api-exchanges/`，并由至少一个exchange引用；
6. `inputs/**`、`storage/**`继续执行既有专用校验，不能仅因不进Index而跳过或放宽。

## 4. 修改边界与Source Identity

本设计包只修改`specs/**`、`docs/**`。后继实现把以下三项加入Stage R：

```text
M docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json
M scripts/verify-canvas06-e2e-report.mjs
M scripts/verify-canvas06-e2e-report.test.mjs
```

既有writer/test、Runner/sink和Schema validation owner仍按Stage R原allowlist修改。活动计数取代Release Discovery闭包的中间值：

```text
Stage R = 29=27 M+2 A
O..R = 48=36 M+12 A
```

Runner Source Set仍为24项；`verify-canvas06-e2e-report.mjs`是entry 2，因此相对Stage A改为`10 changed/new +14 unchanged`。Schema和测试不进入Source Set。

不允许修改公共HTTP wire、SQLite DDL、Manifest/Report字段、Profile业务bytes、Playwright config、Gate或Capability状态。若实现还需要其他source路径，必须新增后继bugfix规格。

## 5. 验收

至少覆盖：

1. 16项无动态证据正例；
2. Family candidate/SETUP/subject多exchange及request/response动态refs正例；
3. exchange file八字段bytes、Index九字段对象及raw ref/digest闭包；
4. 缺`exchange_ref`、wrong kind/path/SHA、重复sequence/ref、孤立body、未索引evidence、索引extra反例；
5. `inputs/**`与`storage/**`合法支持文件正例，以及在其中伪装API/log/failure证据的反例；
6. writer、Schema、Report verifier定向测试；
7. Source Set `0.2/24`相对A的`10/14`，Stage R `29`与累计`48` exact status/path集合。

执行：

```text
node --test scripts/canvas06-e2e-attempt-artifacts.test.mjs
node --test scripts/verify-canvas06-e2e-report.test.mjs
npm run contract:validate
npm run release:canvas06:e2e:runner:test
git diff --check
```

## 6. 回滚与证据边界

回滚必须同时恢复Schema、writer、sink、Index、verifier、Source Set relative计数和Stage R source guard；禁止只删除动态ref或放宽extra检查。

本闭包及其定向测试不构成真实`194/388`、E2E Report、GATE-06-03、Candidate、Activation、Capability、production或ISO 19450:2024证据。
