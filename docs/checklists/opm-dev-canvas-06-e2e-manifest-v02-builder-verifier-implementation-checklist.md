# Checklist: DEV-CANVAS-06 E2E Manifest v02 Producer/Verifier实现

状态：`NODE_CLOSURE_COMPLETE / PRODUCTION_REBUILD_PENDING`

Production准入：`READY_FOR_CLEAN_R_EXTERNAL_STORE_REBUILD`。`9048bb3...`既有194-case Manifest仅为origin build证据，最终Manifest必须绑定最终Runner commit `R=4b30d269...`。

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
| CLI/布局/source-root exact join | 6、7 | C11~C15、C34~C39 |
| producer/verifier顺序 | 8、9 | C16~C21、C37 |
| 错误/事务 | 10 | C22~C24 |
| 验收/验证 | 11 | C25~C31 |
| 回滚/状态 | 12、13 | C32、C33、C43~C46 |

## Plan

- [x] C01 只实现Manifest `0.2/0.2.0` producer/verifier，不执行194/388。
- [x] C02 OpenAPI、SQLite、Vue、Java、v01和既有release root保持只读。
- [x] C03 失败测试先复现第四driver与146/48两个冲突。
- [ ] C04 Profile、Common Driver、Family Catalog、Common `0.2.0` 44文件root（含Common Setup Plan）、Handoff `0.2`、READY Intake、Runtime和Web统一production输入逐项相等。
- [ ] C05 source delta恰好属于17路径allowlist。
- [ ] C06 v01只读复用仅限五个helper，未导入v01 composer/release/verifier。
- [x] C07 Manifest `driver_catalog`为四项固定顺序。
- [ ] C08 16个Common case只引用`DRIVER-COMMON`且source ref唯一。
- [x] C09 Report v02使用自有summary，READY=`137/57`。
- [ ] C10 历史Report/Manifest `0.1` raw bytes未变化。
- [ ] C11 production/controlled CLI参数、`--source-date-epoch`规范整数/UTC整秒往返、production commit epoch join、Verifier显式`--source-root`、mode互斥和flag完整。
- [ ] C12 final root包含trust/family/profile/common/build/four drivers。
- [ ] C13 Profile source/staging/final五资产raw refs与tree三方相等，package/binding join通过。
- [ ] C14 Runtime JAR和Web dist来自统一source commit固定路径，并与Handoff和final copy三方exact join。
- [ ] C15 Common 44文件（含Common Setup Plan）、四driver固定source路径和final raw/tree ref复核通过。
- [ ] C16 producer按冻结first-failure顺序执行，Profile source验证和Staging seal先于Manifest final staging。
- [ ] C17 `178 Family + 16 Common`同序派生。
- [ ] C18 Common expectation恰好`7 PASS + 9 BLOCKED`。
- [ ] C19 staging内部Schema和semantic verifier均通过后才rename。
- [ ] C20 verifier从显式clean source与final Profile root独立复算，且Manifest root前后tree digest相等。
- [ ] C21 production/controlled verifier信任边界不互用。
- [ ] C22 稳定错误码、exit和stderr首行逐项覆盖。
- [ ] C23 rename前失败零final，residual/final拒绝覆盖。
- [ ] C24 rename后parent fsync失败不声明成功。
- [ ] C25 第四driver缺失负例先失败后通过。
- [ ] C26 旧146/48负例失败，137/57正例通过。
- [ ] C27 controlled完整正例通过。
- [ ] C28 production versioned Handoff完整正例通过。
- [ ] C29 Profile source缺项/link/路径漂移、Staging预存在/root重叠/source drift及Common/Family/JAR/Web/driver反例矩阵通过。
- [ ] C30 `npm run release:canvas06:e2e:manifest:v02:test`通过。
- [ ] C31 Schema、Runner、contract与`git diff --check`通过。
- [ ] C32 回滚不删除历史资产或用户数据。
- [ ] C33 未提升Report/Gate/Candidate/Activation/Capability/ISO状态。
- [x] C34 Profile Source Set固定为clean source五个精确分散路径，不存在“source内五资产共同物理root”假设。
- [x] C35 Producer `--profile-asset-root`固定为fresh、隔离、由本次调用逐byte创建的Staging target；Verifier同名参数固定为Manifest final Profile root。
- [x] C36 Staging恰含`profile.json/rules/grammar/symbols/normalization`五个固定文件，禁止extra、scan、fallback和整个Profile package复制。
- [x] C37 唯一时序固定为source raw/package/binding -> Staging absent/materialize/fsync/reverify/seal -> final copy -> source/staging/final三方复核 -> final rename前删除Staging并fsync父目录。
- [x] C38 tree digest固定使用逻辑`root_path=inputs/upstream/profile-assets`和既有JCS公式；物理source/Staging路径、mode和mtime不进入identity。
- [x] C39 Profile Staging修正owner固定为总体17项allowlist内的7个精确路径，现有Profile helper与Schema保持只读。
- [x] C40 production Producer/Verifier在读取目标版本根前精确检查同source12 final marker和temp residual，任一存在即`E2E_MANIFEST_INPUT_QUARANTINED/3`。
- [x] C41 marker guard禁止目录扫描、latest、mtime、follow link、cleanup、移动和覆盖；controlled mode不得读取production quarantine目录。
- [ ] C42 exact marker/temp/link/directory/截断/Schema-invalid/lstat failure/其他source12隔离正反例通过。
- [x] C43 `17=14 M+3 A`集成commit只作为`9048bb3...` origin来源；独立9项External Store commit和8项Common commit均禁止消费。
- [x] C44 最终production source唯一为Final Production Source Chain的R；链为`O->C->S->A->R0->R`，每一段均为single-parent，A不得冒充最终source。
- [ ] C45 Handoff、Intake解析Handoff、Manifest、source HEAD、Report runner identity与R六方逐字符相等。当前Report尚未生成，保持未完成。
- [x] C46 从fresh clean R依序重建Handoff/Intake/Runtime/Web/Common和Manifest，并完成external Unified Verifier与Manifest staging/installed双Verifier：Manifest SHA=`6692e32d...989c`。

## 当前状态

- 设计与实现边界：`FROZEN_FOR_IMPLEMENTATION`。
- Java/Node实现：`NODE_CONTROLLED_CLOSURE_COMPLETE`。v02 Producer、只读 Verifier、五资产 Staging、four-driver 和 `137/57` 聚合已实现；受控构建、重复字节稳定和 Verifier tree-digest 不变由 `release:canvas06:e2e:manifest:v02:test` 覆盖。
- Common root self-verification：`READY`。
- Production重建：`COMPLETE/INSTALLED_VERIFIED`；final Unified Input与Manifest均从clean R、fresh external store生成。Report及六方join仍不得消费其他root或历史commit。
- Runner 回归：`CLOSED`。Runner 规格允许的 `canvas06-e2e-run-input.test.mjs` fixture 已补齐第四 driver 和五资产 Profile 闭合；`release:canvas06:e2e:runner:test` 已通过`47/47`。
- `GATE-06-03`：`NOT_RUN`。
