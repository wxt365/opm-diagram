# Checklist: DEV-CANVAS-06 E2E Fault Launcher Contract Base Schema Conformance Bugfix

状态：`COMPLETE / HISTORICAL_READY_NOT_CONSUMABLE`

活动边界：该READY仅保留历史含义。final production source-chain要求从`9048bb3...`重建C与S；旧`63851f8.../586d6de...`不得供新2A消费。

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标/复现/Root Cause | 1、2 | P01~P06 |
| 权威输入/边界 | 3、4 | P07~P13 |
| Schema条件分支 | 5 | P14~P23 |
| 正反例/命令 | 6、7 | P24~P32 |
| 新base接纳/2A恢复 | 8、9 | P33~P41 |
| 回滚/事实/非结论 | 10 | P42~P45 |

## Checklist

- [x] P01 已确认`63851f8...`的Gate Schema对所有状态强制12项DURING。
- [x] P02 已确认failure code只允许Gate mutation。
- [x] P03 已确认contract测试缺FAILED条件分支正反例。
- [x] P04 已确认未提交2A builder同样拒绝真实DURING前缀。
- [x] P05 Node 22下旧局部定向测试`4/4 PASS`，但不构成活动契约通过。
- [x] P06 Root Cause已收敛为contract实现未同步后继FAILED语义。
- [x] P07 活动语义owner固定为Preflight Descriptor/Gate Observation闭包规格。
- [x] P08 缺陷base完整SHA和parent已冻结。
- [x] P09 Gate Observation identity保持`0.1`，不升级版本。
- [x] P10 `63851f8...`状态冻结为`REJECTED_AS_2A_CONTRACT_BASE`。
- [x] P11 source delta唯一为Schema与既有contract测试`2 M`。
- [x] P12 其余contract、36 baseline、Runner、Java和release root均只读。
- [x] P13 extra tracked/untracked变化固定阻断，不允许扩大本包。
- [x] P14 顶层公共字段、refs、snapshot和digest保持不变。
- [x] P15 `during`基础范围改为`0..12`。
- [x] P16 PASS固定恰12项DURING。
- [x] P17 PASS固定mutation=0且failures为空。
- [x] P18 FAILED固定DURING `0..12`且failures非空。
- [x] P19 failure code固定为Gate mutation或Playwright execution failure。
- [x] P20 DURING failure必须携带合法schedule/cycle。
- [x] P21 BEFORE/AFTER failure必须显式null schedule/cycle。
- [x] P22 failure对象继续封闭且evidence refs不放宽。
- [x] P23 有序前缀和跨项关系由2A semantic verifier负责，Schema不排序数组。
- [x] P24 三个正例和七个负例已逐项冻结。
- [x] P25 正例覆盖PASS、Gate FAILED前缀和Playwright FAILED零前缀。
- [x] P26 负例覆盖长度、failure、mutation、code、phase和extra字段。
- [x] P27 测试对象必须fresh构造，禁止mutation串扰。
- [x] P28 正例必须复算payload SHA。
- [x] P29 Node固定使用`22.22.0`，不要求Node 24。
- [x] P30 两个contract定向测试命令已冻结。
- [x] P31 `npm run contract:validate`和`git diff --check`已冻结。
- [x] P32 source name-status和clean worktree检查已冻结。
- [x] P33 新base必须single-parent于`63851f8...`。
- [x] P34 新base必须记录commit/tree/epoch/raw binary patch SHA。
- [x] P35 origin到新base仍为12个逻辑路径，必须重算raw refs与集合摘要。
- [x] P36 旧contract bytes/patch SHA不得复用。
- [x] P37 checklist未变为READY前禁止启动2A Build。
- [x] P38 2A仍只允许两个固定新增文件。
- [x] P39 controlled spec固定使用`.release.spec.ts`文件名。
- [x] P40 现有临时2A工作树固定为失败现场，不得直接提交或搬运。
- [x] P41 新base后必须fresh重做CLI/Report/D01-D08/Manifest/Context/D10B。
- [x] P42 回滚只撤销未接纳`2 M`候选。
- [x] P43 不删除缺陷base或失败现场。
- [x] P44 本设计未生成新base、2A、controlled evidence或Gate。
- [x] P45 Spec Mapping覆盖目标、范围、非目标、约束、验收、验证和回滚。

## 当前门状态

- Contract Schema bugfix：`IMPLEMENTED/VERIFIED`。
- `63851f8...`：`REJECTED_AS_2A_CONTRACT_BASE`。
- 新contract base：`586d6dee1b07c6634267aeb344e8826adb1ddb4b/READY_AS_2A_CONTRACT_BASE`。
- Fault Launcher 2A：`DESIGN_BLOCKED_BY_D01_PARENT_CHAIN_CONFLICT`；由后继D01三段Source闭包规格修正。
- Controlled Playwright：`NOT_RUN`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。

## Acceptance Record

```text
commit=586d6dee1b07c6634267aeb344e8826adb1ddb4b
tree=1e8111b1ef53970bf450ba7f96c44e5a54f20e1e
parent=63851f8878dcf6da86e99d5ffa7795ac48200920
committer_epoch=1787743172
raw_binary_patch_sha256=56138e19bd83241ffdd60bda3f156a3f9c0b768c6d083ea453893e428ce021e4
contract_raw_refs_sha256=8662b3bbd051a3f5756a28baa411149e64e2319d085cfe68479556af8bd5b1d9
node_version=22.22.0
targeted_tests=13/13 PASS
contract_validate=PASS
diff_check=PASS
source_porcelain=EMPTY
```

12项raw ref按Preflight闭包第13.2节固定顺序记录为：

| path | byte_length | sha256 |
| --- | ---: | --- |
| `package.json` | `14459` | `7ca14200d1ed1ebc12dcda356f35a01b840706d66cff7ddbda46856ca39e3f2b` |
| `scripts/validate-canvas06-controlled-input-bundle-schema.test.mjs` | `3502` | `db655a1549c417ea542400525f378bcec25fc0e255ac1da08f56d9b4ca5be553` |
| `scripts/verify-canvas06-controlled-input-bundle.mjs` | `6441` | `3021f21376fbdf018608a3d7d00f3041c08d36524cdc6697ba8f3cd9ecf1c258` |
| `scripts/verify-canvas06-controlled-input-bundle.test.mjs` | `7568` | `6abf968e46df8671c33f29a120776dbdc402093b9af1a07b7bff8a8d19a8acbc` |
| `docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle-v02.schema.json` | `1751` | `b860c07836205a0dee5178ab1ee3ca121c1b244101a502996b8647dcadf7d8e5` |
| `docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor.schema.json` | `4908` | `095d544df27d239669cf07b3436007aa856ecee900a5e258928eb37abd7da0d3` |
| `docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-jarit-report.schema.json` | `2872` | `27144e5f1211c184ac24c7517daeff1107b7af3b1d9ff137f19614295f6bc337` |
| `docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json` | `6930` | `7436f6b0f0d92636e3d956c04ecf6b447c15dda71b2f727f16007674df0cb62f` |
| `scripts/release-canvas06-e2e-fault-launcher-preflight-input.mjs` | `28105` | `9aef8ba2e983cf7654bd4675c6cc1aa9be4f488581e0c03125ed2f6e6b08dc0c` |
| `scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs` | `14815` | `89d04c7c0e6bdc47a03fc06d6d2b81b53eee668a7f84462761c9d909ecdf2e60` |
| `scripts/verify-canvas06-e2e-fault-launcher-preflight-input.mjs` | `787` | `00e580c82a852073c4f7250cc35ce2d106033d9a186f093ee5e2ac56d91b89ec` |
| `scripts/verify-canvas06-e2e-fault-launcher-preflight-input.test.mjs` | `890` | `75a9a5d008f9f5c6f498f70dc8ce56ac72d50ac4482b0d3e90f77cfe587e7e6a` |

集合摘要算法固定为`SHA-256(RFC8785_JCS(上述12个{path,byte_length,sha256}对象组成的有序数组))`。
