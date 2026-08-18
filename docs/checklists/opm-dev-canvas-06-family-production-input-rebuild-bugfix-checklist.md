# DEV-CANVAS-06 Family Production Input Rebuild Bugfix Checklist

后继状态：`SUPERSEDED_FOR_ACTIVATION_BY_VERSIONED_HANDOFF_REPORT_REF_CLOSURE`。本Checklist保留`clean-a36a7f1fd709`生成、安装尝试和回滚的历史事实；不得继续用原规格重试固定Handoff切换。后续必须执行`specs/opm-dev-canvas-06-versioned-handoff-report-ref-closure-bugfix-task-spec.md`，生成新source commit和新版本根；`clean-a36a7f1fd709`永久只读、不得覆盖。

状态：`VERSION_ROOT_INSTALLED / FIXED_HANDOFF_SWITCH_ROLLED_BACK_REPORT_REF_CLOSURE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-family-production-input-rebuild-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标/Root Cause：规格第1、2章。
- 允许/禁止边界：规格第3章。
- source base/delta/closure：规格第4章。
- worktree与root隔离：规格第5章。
- 版本化输出：规格第6章。
- 唯一执行顺序：规格第7章。
- 验收：规格第8章。
- 回滚：规格第9章。
- 状态边界：规格第10章。

## Plan

- [x] 旧Clean Handoff规格不能扩展授权Family生产输入重建。
- [x] base commit、37项source delta和禁止扩大提交集合已冻结。
- [x] JCS parity vectors与Common Fixture Catalog两份固定测试资产已纳入allowlist，并冻结raw SHA。
- [x] GATE-05-01唯一TAP命令、Report command数组、16/16计数和禁止Node 22规避边界已冻结。
- [x] 固定集成测试`absolute directory/directories`断言漂移已定位，唯一exact修正和禁止放宽守卫边界已冻结。
- [x] 三个集成helper直接读取历史固定Handoff的问题已定位；exact Intake -> Candidate Handoff唯一解析顺序和禁止basename回退已冻结。
- [x] 双clean worktree、两个外部Builder staging root、同父安装staging和禁止路径重叠已冻结。
- [x] 版本化release root、Common 43文件和Manifest布局已冻结。
- [x] 固定Handoff预验、安装、原子切换、安装后重验和回滚已冻结。
- [x] production Manifest CLI、`--require-production`和194/388验收已冻结。

## Source Commit

- [x] 专用branch/worktree已存在，base exact SHA为`6d76bf6050adecfa5aa0acfb4b7b8a62d413df14`；首次source commit为`ef268177d9c9e64f6d72d64832328c790638cc70`。
- [x] 首次36项patch SHA为`94ed125044ef3de97b09a14ef26ad55102392e0d29a7590710585d39a2661b2f`，仅作为superseded失败尝试历史身份。
- [x] 首次retry source/patch为`70b73e806fee0ad12616d85923695095be07c62a`/`52380c66a15422968364140e6459f1d693b07d03ae2ca814e3bdb7578aff904a`，仅作为integration断言阻断的superseded历史身份。
- [x] 第二次retry source/patch为`7f4deb0b3f5eacb1790885dc09b8905f857de909`/`5a71c2513c92e0675c073100e18dba4493bbed7681685d4f5a9b3217cdf5011d`，仅作为fixed Handoff ref漂移阻断的superseded历史身份。
- [x] 实际执行输入`executed_governing_spec_sha256`为`245f66cf9f6aaf52306a0d18e88ed5ca12473117faf2ffe4db919334186cdb9b`；执行前复算一致。
- [x] 执行完成状态回填后的`current_spec_sha256`为`0c779deb20d252d5024da15cc73b3cb22ba0eba45f6c31457d0d4e554add9444`；不反向改变执行输入身份。
- [x] `base..source`恰为`37=4 M+33 A`，无D/R/C/submodule/extra。
- [x] 两份固定测试资产raw SHA分别为`5b3f081befd991a12ef36e4f512fb0c129dd22e60bdfe9af4731b993d970ac6a`和`9133096ad601b223b1e42112631acfff5506e80c403e4d9f529a1f398439f8ea`。
- [x] `source_delta_patch_sha256`计算边界已同步为37项amended source commit的`git show --format= --no-ext-diff --binary`原始bytes。
- [x] 最终`source_delta_patch_sha256`执行值已记录：`63dbbf49b99a51ccbb2bc72a9bb424df0979adaca883a40aa7c82e864391e74a`；未复用前三次值。
- [x] 最终amended source commit单父、非merge，branch/target worktree均指向最终commit且启动时status为空。
- [x] E2E Manifest集成测试已移除固定历史`clean-*`和固定Handoff basename身份依赖。
- [x] 三个`CANVAS06_TEST_*`输入只用于集成测试定位，缺失/escape/symlink/ref不匹配反例通过。
- [x] Common、Controlled和Legacy helper均从exact Intake `handoff_ref.path`读取同一Candidate Handoff，固定`dev-canvas-05-handoff.json`零读取。
- [x] JCS、Controlled Bundle、Common和E2E Manifest定向测试通过：`34/34=2+9+5+18`。
- [x] GATE-05-01实际子命令和Report command逐项等于冻结TAP命令，raw包含`TAP version 13`且`16/16 MATCHED`。
- [x] 固定集成测试绝对目录反例匹配`/absolute directories/`且完整测试`5/5`通过。

## Upstream Rebuild

- [x] fresh `clean-a36a7f1fd709`上游版本根已生成，未安装到主工作树。
- [x] Bundle中replay和Family Catalog entry分别唯一且raw SHA闭合。
- [x] 历史release descriptor alias已恢复，历史`handoff/release/**`tree digest仍为`8fded696d4c148eda68e98e7530c5cfbff2226a36f94a32b2518527c37f11596`。
- [x] candidate Handoff版本副本为`READY_FOR_DEV_CANVAS_06`，blockers为空。
- [x] Intake为`READY_FOR_RELEASE_VALIDATION`，8项check和34项Capability均MATCHED；Capability仍只eligible、production gate仍DISABLED。

## Common And Manifest

- [x] TARGET worktree在ignored build/JAR副本后仍clean，Runtime JAR SHA等于Handoff exact ref。
- [x] 外部Common root恰43文件，Builder/Verifier前后tree digest相等。
- [x] production E2E Manifest Builder成功，final root在外部output中原子形成。
- [x] production verifier预验成功且不改变Manifest tree。
- [x] Manifest满足194/388、178/2、16 Common、唯一Family Catalog ref和三个driver顺序。

## Install And Reverify

- [x] 同文件系统staging已完整复制版本根/Common/Manifest并fsync。
- [x] final版本根以一次atomic rename安装，旧version roots未变化。
- [ ] 固定Handoff在保存旧SHA后以一次atomic rename切换：已尝试且回滚，candidate引用的`reports/**`未在版本根内闭合。
- [x] backup basename/raw SHA闭合；重验失败后已从backup原子恢复旧Handoff，并删除candidate/backup。
- [ ] 真实handoff根Handoff validator通过：失败，`reports/golden-contract.json`与candidate raw ref不一致。
- [ ] 真实安装根production verifier以`--require-production`再次通过：未执行，因为Handoff validator失败后已回滚。
- [ ] 重验成功后旧Handoff临时备份已删除并fsync父目录。

## Failure And Rollback

- [ ] 安装前失败证明零final版本根、零固定Handoff变化。
- [x] 切换后Handoff validator失败，固定Handoff已恢复exact旧SHA。
- [x] 未激活新版本根不删除、不覆盖、不被下游引用。

## Release Boundary

- [x] 未生成E2E/Visual/Performance/Recovery READY Report。
- [x] 未生成release Candidate或Activation，未启用Capability。
- [x] 未声明production release或ISO 19450:2024符合性。

## Execution Result

```text
source_commit=a36a7f1fd709b72e66c57e5aea634da525c9c515
superseded_source_commit=ef268177d9c9e64f6d72d64832328c790638cc70
superseded_source_delta_patch_sha256=94ed125044ef3de97b09a14ef26ad55102392e0d29a7590710585d39a2661b2f
superseded_retry_source_commit=70b73e806fee0ad12616d85923695095be07c62a
superseded_retry_source_delta_patch_sha256=52380c66a15422968364140e6459f1d693b07d03ae2ca814e3bdb7578aff904a
superseded_retry2_source_commit=7f4deb0b3f5eacb1790885dc09b8905f857de909
superseded_retry2_source_delta_patch_sha256=5a71c2513c92e0675c073100e18dba4493bbed7681685d4f5a9b3217cdf5011d
executed_governing_spec_sha256=245f66cf9f6aaf52306a0d18e88ed5ca12473117faf2ffe4db919334186cdb9b
current_spec_sha256=0c779deb20d252d5024da15cc73b3cb22ba0eba45f6c31457d0d4e554add9444
source_delta_patch_sha256=63dbbf49b99a51ccbb2bc72a9bb424df0979adaca883a40aa7c82e864391e74a
release_root=packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-a36a7f1fd709
release_tree_sha256=1537fd42cf10c3430996f37cb7a0285cd49f6e796ed0928073062fd433cf9da2
release_descriptor_sha256=c72480ac17f8f4290d562a9e411466ee188f6e4744a394b91d174b40572592f4
handoff_sha256=c5b125af55ce60110f059ba82623e8fb70411b57922177977566dc8b5cb3be8c
intake_sha256=a018e542aec50c7018326ea22e17dca90e2ecab379e014d1e4db2272c344546c
bundle_sha256=9c0be418f2c6c7351855aad685ecdb02e44c0c2194d997d162036f01ad192d72
runtime_jar_sha256=aef3d5586877f40870447539a30abe37193115514da92f0bc1ce41cb7fd4579f
common_tree_sha256=869b7d59a6f789e188d44488c247b3e95d58f56e807fd75accd936a236142484
manifest_tree_sha256=6fb952c9bd619dafd425e459e5e95615142f6e67a24f11cc13dcc319f8b0548e
production_preverify=PASSED
production_postverify=NOT_EXECUTED_AFTER_HANDOFF_VALIDATOR_FAILURE
fixed_handoff_switch=ROLLED_BACK
```

## Installation Attempt

```text
common_tree_sha256=869b7d59a6f789e188d44488c247b3e95d58f56e807fd75accd936a236142484
manifest_tree_sha256=6fb952c9bd619dafd425e459e5e95615142f6e67a24f11cc13dcc319f8b0548e
production_preverify=PASSED
installed_release_root=clean-a36a7f1fd709
fixed_handoff_switch=ROLLED_BACK
fixed_handoff_restored_sha256=0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326
postverify_failure=Handoff candidate references reports/golden-contract.json (1152/f51ea1cb...), while the fixed Handoff root contains 1130/e7180b90...; reports/trace-closure.json also differs.
```
