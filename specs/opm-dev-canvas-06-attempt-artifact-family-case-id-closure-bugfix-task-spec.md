# DEV-CANVAS-06 Attempt Artifact Family Case ID Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭活动 Manifest `0.2` 的 `178` 个 Family case 无法写入 Attempt Artifact `0.2` 的两个P0 Schema冲突，使 `194 case / 388 attempt` 能使用同一套 Fault Plan、Materialization、Observation 和 Index 契约。

## 2. 事实与 Root Cause

1. 活动 Manifest 恰含 `194=178 Family+16 Common` 个 case；Family ID 使用 `G-OPL-PROC|CTRL|STRUCT-*`，Common ID使用`E2E-CANVAS-001~007.*`；
2. `opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json` 的共享`$defs.caseId`仅接受`^E2E-CANVAS-00[1-7]\..+$`；
3. 因此合法 Family `fault-plan.json` 在Materializer启动前必然被Schema拒绝；这不是Runner业务失败，而是活动机器契约不可执行；
4. Family Manifest的`fixture_ref/input_ref`是`ArchiveEntryRef={path,byte_length,sha256,bundle_sha256,archive_entry_path}`，而Materialization Artifact `0.2`只接受必含`kind`的四字段`FileRef`；Java CLI也按`FileRef`读取，真实Family Manifest必然在`MANIFEST/INPUT`阶段失败；
5. Manifest、Report和Runner语义均已冻结Family case及Archive身份，不能通过改名、丢弃Archive字段、复制为Common ID或跳过Schema规避。

## 3. 唯一修正

活动Attempt Artifact `0.2`的共享`caseId`固定为：

```text
^(?:E2E-CANVAS-00[1-7]\..+|G-OPL-(?:PROC|CTRL|STRUCT)-\d{3}\.[A-Z0-9_]+\.(?:PASS|BLOCKED))$
```

语义边界：

1. 正则只定义两族合法机器字形，不授予case身份；
2. producer和verifier仍必须要求`case_id`与活动Manifest `cases[]`唯一exact join；匹配正则但Manifest不存在的ID固定拒绝；
3. 三个Fault Launcher case的`case_id/fault_kind/target/trigger_count`专用条件保持不变；全部Family case继续只允许`fault_kind=NONE/target=NONE/trigger_count=0`；
4. 不修改Manifest、Report、Runner Source Set版本，不改字段、摘要、排序、错误优先级或artifact数量；
5. 历史Attempt Artifact `0.1` bytes只读，不回写已提交证据。

Materialization的`fixture_ref/input_ref`固定使用封闭联合：

```text
AttemptInputRef = FileRef | ArchiveEntryRef
```

并按`fixture_kind`唯一收紧：

1. `FAMILY`：`fixture_ref/input_ref`都必须是五字段`ArchiveEntryRef`，逐字段等于Manifest case原对象；
2. `COMMON`：`fixture_ref`必须为`kind=FIXTURE`的四字段`FileRef`，`input_ref`必须为`kind=INPUT`的四字段`FileRef`，逐字段等于Manifest case原对象；
3. Java Materializer使用两类ref共同的`path/byte_length/sha256`复核raw bytes，并把完整Manifest ref原样写入artifact；不得投影、补`kind`、删除`bundle_sha256/archive_entry_path`或从路径推断类型；
4. Runner与只读verifier使用结构深等比较Artifact和Manifest ref；只比四字段、忽略Archive字段或把`undefined kind`视为相等均禁止。

## 4. 修改边界

允许修改：

- `docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json`；
- `scripts/validate-canvas06-visual-e2e-schemas.test.mjs`；
- Stage R中已允许修改的Runner/Attempt/verifier定向测试，仅用于证明Family Fault Plan和Materialization可消费；
- `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCli.java`；
- `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCliTest.java`。

禁止修改：

- Manifest/Report/历史Attempt Artifact Schema；
- 公共API、SQLite DDL、Profile、fixture、Catalog、Driver业务语义；
- fault专用映射、Gate、Candidate、Activation或Capability状态；
- `.harness/**`及无关文件。

## 5. 验收

1. 活动Manifest全部194个`case_id`均通过新字形；
2. 178个Family ID和16个Common ID分别至少有一个Fault Plan/Materialization Schema正例；
3. Family Archive ref与Common File ref正例通过；Family/File、Common/Archive、两类混用、缺/extra Archive字段及Artifact/Manifest ref drift全部拒绝；
4. 错误Family族、错误三位编号、缺expectation、小写或额外段、未知但字形合法且不在Manifest的ID均被对应Schema或semantic verifier拒绝；
5. 三个fault专用映射和non-fault `NONE`反例保持通过；
6. Java preflight和forked-JAR正例使用真实Family Archive ref，证明CLI不再依赖`kind`且输出完整ref；
7. `npm run contract:validate`、Java定向测试、Runner定向测试、完整Node 22 Runner套件和`git diff --check`通过。

## 6. 回滚与状态

回滚必须同时回滚Schema、正反例和Runner消费测试；回滚后真实Family `194/388`恢复为`BLOCKED_BY_ATTEMPT_CASE_ID_SCHEMA`，不得保留可执行状态声明。

本规格曾把Stage R allowlist扩为`31=29 M+2 A`，累计`O..R=50=38 M+12 A`；后继Common Precondition Machine Contract及其test source owner闭包最终取代为`33/52`。新增两个Java owner与Common Driver test均不进入Runner Source Set `0.2/24`，只通过同一clean R重建或测试闭合。它不构成真实`194/388`、E2E Report、GATE-06-03、Candidate、Activation、Capability、production或ISO符合性证据。
