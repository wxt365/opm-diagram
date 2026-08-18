# DEV-CANVAS-06 Versioned Handoff Report Ref Closure Bugfix Checklist

状态：`DESIGN_FROZEN_AFTER_ALLOWLIST_MODE_CORRECTION / IMPLEMENTATION_NOT_STARTED / INSTALLATION_BLOCKED`

## Task Type

- `bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-versioned-handoff-report-ref-closure-bugfix-task-spec.md`
- 目标：规格第 1 节；Candidate Handoff 全部直接 raw ref 版本化，12 个报告文件纳入不可变版本根。
- Root Cause/复现：规格第 2、4 节；`clean-a36a7f1fd709` 的 artifact/report ref 根不一致导致固定 Handoff validator 失败并回滚。
- 范围/非目标：规格第 3 节；只改 14 个 source 文件和状态文档，不改 Schema/API/SQLite/Java/Vue/语义资产。
- source identity/delta：规格第 5 节；base `a36a7f1fd709b72e66c57e5aea634da525c9c515`，精确 `14=12 M+2 A`。
- owner/ref 映射：规格第 6 节；唯一共享 owner、source12/handoff_id/版本根 join、12 文件集合和10个direct ref映射。
- 固定布局：规格第 7 节；`17=5 root+12 reports`、Common 43和exact Manifest tree。
- Builder/Generator：规格第 8 节；显式CLI、版本根唯一读写、固定alias零写入。
- staging/install/fixed switch：规格第 9、10 节；STAGING/INSTALLED双模式、同父rename、先安装重验再原子替换固定JSON。
- 首错/失败/回滚：规格第 11、14 节；分阶段零输出或保留未激活版本根，fixed switch失败恢复旧raw SHA。
- 测试/验收：规格第 12 节；5组定向测试、production versioned fixture、显式mode反例矩阵和8项正例完成条件。
- 状态同步：规格第 13 节；索引、基线、执行包、测试策略和两个既有checklist。
- 事实/待验证：规格第 15 节；设计冻结不等于source/build/install/release evidence。

## Plan

- [x] 复核 `clean-a36a7f1fd709` 的 source identity、版本根存在性和Candidate直接ref形状。
- [x] 复核固定Handoff当前未激活`clean-a36a7f1fd709`，避免将“已安装”写成“已激活”。
- [x] 冻结独立后继规格，不回改已执行Family Production Input规格的历史语义。
- [x] 冻结唯一owner、direct raw ref范围、12文件集合、版本根布局和原子切换顺序。
- [x] 冻结精确source allowlist、定向测试和反例矩阵。
- [x] 复现12文件allowlist无法修改两个production调用点，且trust默认mode会违反禁止fallback规则。
- [x] allowlist修正为14项，并冻结builder/verifier显式`INSTALLED`与controlled helper显式`CONTROLLED`。
- [x] 冻结production Manifest临时versioned Handoff fixture构造与非release evidence边界。
- [x] immutable base的`loadReadyTrustChain()`调用闭包恰为6处，14项已覆盖全部base调用点及测试；晚于base的E2E Report verifier明确不进入本source delta。
- [x] 同步全局设计状态入口。
- [ ] 在隔离source worktree执行实现。
- [ ] 生成、安装并重验新版本根。

## Design Freeze

- [x] `Task Type=bugfix`和Active Playbooks已声明。
- [x] “所有raw ref”已限定为Handoff Schema直接可达`fileRef`，嵌套Report provenance明确非目标。
- [x] 新source必须以`a36a7f1fd709...`为唯一parent，且生成新`clean-<source12>`。
- [x] `clean-a36a7f1fd709`永久只读、不得覆盖/删除/重新激活为本轮报告根。
- [x] source delta冻结为`14=12 M+2 A`，无D/R/C/submodule/extra。
- [x] 12个report basename和10个direct ref字段映射已逐项冻结。
- [x] 固定布局冻结为`17+43+exact Manifest tree`。
- [x] STAGING和INSTALLED解析模式、禁止fallback规则已冻结。
- [x] trust API mode必填且无默认值；production调用点显式`INSTALLED`，controlled helper显式`CONTROLLED`。
- [x] 版本根安装、安装后重验、固定JSON原子替换和postverify顺序已冻结。
- [x] fixed switch失败的旧raw bytes原子恢复边界已冻结。

## Implementation

- [ ] 新增唯一owner `scripts/dev-canvas-05-versioned-handoff-refs.mjs`。
- [ ] Release Builder写版本根`handoff/reports/**`并拒绝固定alias。
- [ ] Handoff Generator只从同一版本根读取descriptor和reports。
- [ ] Validator支持显式STAGING/INSTALLED模式并复用owner。
- [ ] Intake复用owner和显式解析模式。
- [ ] E2E production trust复用owner并拒绝mutable/跨版本ref。
- [ ] E2E production builder调用点显式传`mode: 'INSTALLED'`。
- [ ] E2E production verifier调用点显式传`mode: 'INSTALLED'`。
- [ ] controlled trust helper显式传`mode: 'CONTROLLED'`且不进入版本化物理resolver。
- [ ] package scripts和4个既有测试已按规格更新。
- [ ] 新owner定向测试已实现。

## Source Commit

- [ ] isolated source worktree从exact base创建且初始clean。
- [ ] 测试import、production call和raw-read闭包复核未超出14文件allowlist。
- [ ] base..source精确为`14=12 M+2 A`。
- [ ] 新source单parent、非merge且不同于base。
- [ ] `source_delta_patch_sha256`已按raw `git show` bytes记录。
- [ ] 新`source12`与release root/handoff_id/descriptor逐项一致。

## Release Root

- [ ] 新final/staging basename在执行前均不存在。
- [ ] 5个root文件完整且为普通单链接文件。
- [ ] `handoff/reports/**`恰为12个冻结文件。
- [ ] Common root恰43文件且tree digest闭合。
- [ ] Manifest tree与production预验输入逐byte相等。
- [ ] staging总文件公式为`17+43+manifest_tree_entry_count`且无额外root entry。
- [ ] `clean-a36a7f1fd709`安装前后tree digest相等。

## Verify

- [ ] `node --test scripts/dev-canvas-05-versioned-handoff-refs.test.mjs`
- [ ] `node --test scripts/validate-dev-canvas-05-handoff.test.mjs`
- [ ] `node --test scripts/release-canvas06-intake.test.mjs`
- [ ] `node --test scripts/canvas06-e2e-manifest-v01-trust.test.mjs`
- [ ] `node --test scripts/release-canvas06-e2e-manifest-v01.test.mjs`
- [ ] mutable `reports/**`、跨版本ref、source12/handoff_id drift反例通过。
- [ ] report缺/多/重复/link/SHA/length反例通过。
- [ ] staging extra/path escape/mode混用/fallback反例通过。
- [ ] existing final覆盖和安装前fixed switch反例通过。
- [ ] Intake/E2E trust均拒绝旧mutable report ref。
- [ ] production builder/verifier缺少mode、错误mode和trust默认mode反例通过。
- [ ] controlled helper缺少`CONTROLLED`或进入物理resolver反例通过。
- [ ] production integration test按HEAD派生临时versioned root并重算12个report及全部direct ref。
- [ ] production integration seed严格来自三个`CANVAS06_TEST_*`输入和clean tracked report root，禁止治理工作树扫描或其他release root fallback。
- [ ] production integration test不读取固定Handoff、不硬编码旧`clean-*`且临时fixture零release evidence输出。

## Install And Reverify

- [ ] STAGING模式完整校验通过。
- [ ] 同父atomic rename安装新版本根并fsync父目录。
- [ ] INSTALLED模式重验Candidate Handoff/Intake/direct refs通过。
- [ ] production Manifest安装后`--require-production`重验通过。
- [ ] 固定Handoff只原子替换JSON，未写固定reports/release alias。
- [ ] 固定Handoff SHA等于版本根Candidate SHA。
- [ ] fixed Handoff direct raw ref全部指向本轮已安装版本根。
- [ ] fixed Handoff postverify和production Manifest postverify通过。

## Failure And Rollback

- [ ] install前失败证明零新final root、固定Handoff SHA不变。
- [ ] install后fixed switch前失败保留未激活只读版本根、固定Handoff不变。
- [ ] fixed switch后注入失败可恢复旧raw SHA并通过旧入口验证。
- [ ] 任一重跑均使用新source commit和新版本basename。
- [ ] `clean-a36a7f1fd709`从未删除、覆盖或修改。

## Evidence Slots

```text
base_source_commit=a36a7f1fd709b72e66c57e5aea634da525c9c515
new_source_commit=NOT_EXECUTED
source_delta_count=NOT_EXECUTED
source_delta_patch_sha256=NOT_EXECUTED
new_release_root=NOT_EXECUTED
new_release_tree_sha256=NOT_EXECUTED
report_tree_sha256=NOT_EXECUTED
common_tree_sha256=NOT_EXECUTED
manifest_tree_sha256=NOT_EXECUTED
candidate_handoff_sha256=NOT_EXECUTED
intake_sha256=NOT_EXECUTED
fixed_handoff_before_sha256=0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326
fixed_handoff_after_sha256=NOT_EXECUTED
clean_a36_tree_before_sha256=NOT_EXECUTED
clean_a36_tree_after_sha256=NOT_EXECUTED
production_preverify=NOT_EXECUTED
production_postverify=NOT_EXECUTED
```

## Release Boundary

- [x] 本设计冻结未创建新source commit或版本根。
- [x] 未切换固定Handoff，未改变当前active binding。
- [x] 未生成E2E/Visual/Performance/Recovery READY Report。
- [x] 未生成Release Candidate或Activation，未启用Capability。
- [x] 未声明production release或ISO 19450:2024符合性。

## Current Conclusion

12文件allowlist冲突已经通过`14=12 M+2 A`及显式mode/fixture契约关闭，设计输入重新冻结，可按本规格进入独立source实现。Family production installation、固定Handoff切换和production Manifest安装后重验继续保持`VERSIONED_HANDOFF_REPORT_REF_CLOSURE_REQUIRED`，直到本Checklist全部执行项和证据槽位闭合。
