# Checklist: DEV-CANVAS-06 Common E2E 输入重建实现

状态：`FROZEN/IN_PROGRESS`

## Task Type

- [x] `feature`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标/问题/唯一修正 | 1、2 | C01~C04 |
| 输入/前置门 | 3 | C05~C09 |
| allowlist/非目标 | 4 | C10~C13 |
| CLI/输出/生成算法 | 5、6 | C14~C22 |
| 原子事务/Verifier | 7、8 | C23~C30 |
| 测试/验收 | 9 | C31~C37 |
| 完成/回滚/事实 | 10~12 | C38~C42 |

## Plan

- [x] C01 独立包只重建活动Catalog `0.2.0`和32个BASE/INPUT。
- [x] C02 factory语义唯一归Common Driver包所有，本包只读消费。
- [x] C03 Builder/Verifier各自每case调用exact factory一次并缓存，不维护第二规则源。
- [x] C04 禁止修改Runner测试、放宽Schema/Verifier或复用旧SHA。
- [x] C05 READY Handoff与active binding为唯一binding输入。
- [ ] C06 exact clean source commit已记录。
- [ ] C07 factory raw byte length/SHA和定向测试结果已记录。
- [ ] C08 Handoff SHA、binding digest、epoch和fresh root已记录。
- [ ] C09 历史0.1.0与既有release root只读证明已记录。
- [x] C10 非文档source delta只允许3个路径。
- [x] C11 factory及factory测试不在本包allowlist。
- [x] C12 historical author、Runner/测试、Schema、API、SQLite、Java、Vue和生产配置禁止修改。
- [x] C13 生成43文件root不计入source delta且不得写入历史路径。
- [x] C14 Builder/Verifier CLI不增加参数。
- [x] C15 临时fresh root恰为43个普通非链接单链接文件。
- [x] C16 Catalog固定`0.1/0.2.0`、8 Visual、16 E2E和summary 8/16。
- [x] C17 16 case顺序与Schema prefixItems逐项相等。
- [x] C18 32个BASE/INPUT由同一轮缓存结果写出并满足唯一JSON编码。
- [x] C19 7 PASS/9 BLOCKED、八个错误码、Ambiguous省略错误码全部闭合。
- [x] C20 generator ref从新mirror raw bytes复算。
- [x] C21 24个factory ref逐字段相等且actual owner/mirror/ref三方闭合。
- [x] C22 8个Visual和32个E2E raw ref全部按新bytes复算。
- [x] C23 已实现fresh staging、file/dir fsync、内部verify、atomic rename、parent fsync顺序。
- [x] C24 rename前失败删除本次staging且final零输出。
- [x] C25 final/staging residual、link/special file和额外文件拒绝。
- [x] C26 Verifier前后tree digest相等。
- [x] C27 Verifier由exact factory缓存重算32个raw bytes，不含本地case regex/error map。
- [x] C28 Catalog action/transaction/reopen与同一factory result深度相等。
- [x] C29 稳定错误码/exit/首错顺序通过。
- [x] C30 parent fsync失败不声明成功，residual进入隔离记录。
- [x] C31 临时43文件、16 case、32路径、24 ref正例通过。
- [x] C32 两次临时fresh build byte-identical。
- [x] C33 活动错误码、Ambiguous伪造错误码和raw byte漂移反例通过。
- [x] C34 raw byte、编码、ref、inventory、link、source drift和原子failure反例通过。
- [x] C35 `npm run release:canvas06:common-visual:test`通过，`14/14`。
- [x] C36 临时build/verify与Manifest v02定向回归通过，后者`29/29`。
- [x] C37 `contract:validate`和`git diff --check`通过。
- [x] C38 当前仅标记`IMPLEMENTED/REBUILD_NOT_RUN`。
- [ ] C39 clean factory生产重建完成后才标记`COMMON_INPUT_READY_FOR_MANIFEST_V02`。
- [x] C40 本设计冻结不提升Manifest/194/388/Report/Gate/Candidate/Activation/Capability/ISO状态。
- [x] C41 回滚不覆盖或删除历史、既有release root和用户数据。
- [x] C42 clean factory commit/SHA当前为待执行输入，不从脏工作树推断。

## 当前门状态

- 设计：`FROZEN_FOR_IMPLEMENTATION`。
- 工具Build：`IMPLEMENTED/REBUILD_NOT_RUN`。
- 生产重建：`BLOCKED_BY_EXACT_CLEAN_FACTORY`。
- Manifest v02 Common输入：`NOT_READY`。
- `GATE-06-03`：`NOT_RUN`。

## 本轮验证（2026-08-25）

- `npm run release:canvas06:common-visual:test`：`14/14`通过。
- `npm run release:canvas06:e2e:manifest:v02:test`：`29/29`通过。
- `npm run contract:validate`：通过。
- `git diff --check`：通过。
- 受控故障注入覆盖rename前staging清理与parent fsync后的quarantine隔离；临时根中的额外文件、符号链接和硬链接均被拒绝。

## Pre-build 诊断基线（2026-08-24）

- Node：`v22.22.0`。
- `npm run release:canvas06:common-visual:test`：`3/6`，factory三项通过，Builder/Verifier三项失败；首个失败为`E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED`与Verifier旧期望不一致。该失败是本规格要修复的实现基线，不勾选C35。
- `npm run release:canvas06:e2e:manifest:v02:test`：`29/29`。
- `npm run contract:validate`：通过。
- `git diff --check`：通过。

以上结果不包含工具修复、fresh 43文件生产重建、Manifest生成或release evidence。
