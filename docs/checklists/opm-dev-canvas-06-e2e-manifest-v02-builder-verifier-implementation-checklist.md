# Checklist: DEV-CANVAS-06 E2E Manifest v02 Producer/Verifier实现

状态：`FROZEN/NOT_STARTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 规格责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标/非目标 | 1、4.3 | C01、C02 |
| Root Cause/Fix | 2 | C03 |
| 权威输入 | 3 | C04 |
| 精确allowlist | 4 | C05、C06 |
| Schema修正 | 5 | C07~C10 |
| CLI/布局 | 6、7 | C11~C15 |
| producer/verifier顺序 | 8、9 | C16~C21 |
| 错误/事务 | 10 | C22~C24 |
| 验收/验证 | 11 | C25~C31 |
| 回滚/状态 | 12、13 | C32、C33 |

## Plan

- [x] C01 只实现Manifest `0.2/0.2.0` producer/verifier，不执行194/388。
- [x] C02 OpenAPI、SQLite、Vue、Java、v01和既有release root保持只读。
- [x] C03 失败测试先复现第四driver与146/48两个冲突。
- [ ] C04 Profile、Common Driver、Family Catalog、经独立重建Verifier通过的Common `0.2.0` 43文件root、READY Intake输入版本与raw identity逐项相等。
- [ ] C05 source delta恰好属于17路径allowlist。
- [ ] C06 v01只读复用仅限五个helper，未导入v01 composer/release/verifier。
- [x] C07 Manifest `driver_catalog`为四项固定顺序。
- [ ] C08 16个Common case只引用`DRIVER-COMMON`且source ref唯一。
- [x] C09 Report v02使用自有summary，READY=`137/57`。
- [ ] C10 历史Report/Manifest `0.1` raw bytes未变化。
- [ ] C11 production/controlled CLI参数、`--source-date-epoch`规范整数/UTC整秒往返、mode互斥和flag完整。
- [ ] C12 final root包含trust/family/profile/common/build/four drivers。
- [ ] C13 Profile五资产/tree/package/binding join通过。
- [ ] C14 Runtime JAR和Web dist来自clean source exact build。
- [ ] C15 Common 43文件与四driver复制后raw/tree ref复核通过。
- [ ] C16 producer按冻结first-failure顺序执行。
- [ ] C17 `178 Family + 16 Common`同序派生。
- [ ] C18 Common expectation恰好`7 PASS + 9 BLOCKED`。
- [ ] C19 staging内部Schema和semantic verifier均通过后才rename。
- [ ] C20 verifier独立复算且前后tree digest相等。
- [ ] C21 production/controlled verifier信任边界不互用。
- [ ] C22 稳定错误码、exit和stderr首行逐项覆盖。
- [ ] C23 rename前失败零final，residual/final拒绝覆盖。
- [ ] C24 rename后parent fsync失败不声明成功。
- [ ] C25 第四driver缺失负例先失败后通过。
- [ ] C26 旧146/48负例失败，137/57正例通过。
- [ ] C27 controlled完整正例通过。
- [ ] C28 production versioned Handoff完整正例通过。
- [ ] C29 Profile/Common/Family/JAR/Web/driver反例矩阵通过。
- [ ] C30 `npm run release:canvas06:e2e:manifest:v02:test`通过。
- [ ] C31 Schema、Runner、contract与`git diff --check`通过。
- [ ] C32 回滚不删除历史资产或用户数据。
- [ ] C33 未提升Report/Gate/Candidate/Activation/Capability/ISO状态。

## 当前状态

- 设计与实现边界：`FROZEN_FOR_IMPLEMENTATION`。
- Java/Node实现：`NOT_STARTED`。
- Production重建：`BLOCKED_BY_EXACT_CLEAN_BASE_COMMON_DRIVER_AND_COMMON_INPUT_REBUILD`。
- `GATE-06-03`：`NOT_RUN`。
