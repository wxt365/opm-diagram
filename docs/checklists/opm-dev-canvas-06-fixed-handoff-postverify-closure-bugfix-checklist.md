# DEV-CANVAS-06 Fixed Handoff Postverify Closure Bugfix Checklist

状态：`IMPLEMENTED / READY_REPORT_RECORDED / FIXED_SWITCH_FINALIZED`

## Task Type

- `bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-fixed-handoff-postverify-closure-bugfix-task-spec.md`
- 目标：规格第1章；拆分fixed path等价验证与installed Intake production trust。
- Root Cause/复现：规格第2、3章；fixed path与Intake锁定versioned path不可能同时满足完整ref相等。
- 范围/非目标：规格第4章；不改trust/sameRef/既有Schema/已安装release root，不生成Candidate或Activation。
- source identity/delta：规格第5章；subject source与tool source分离，tool delta精确`4=1 M+3 A`。
- CLI/输入：规格第6章；8个必填参数、固定相对路径和值域。
- exact join：规格第7、8章；fixed/versioned/Manifest copy/production verifier四方闭包。
- Report：规格第9章；Report `0.1`、8项检查、READY/BLOCKED和payload SHA。
- 失败/事务：规格第10、12章；pre-acceptance零Report、可报告BLOCKED、原子final root、首错和退出码。
- fixed switch/回滚：规格第11、15章；backup marker、失败恢复、READY后收尾和live guard。
- 测试/验收：规格第13章；定向正反例和唯一真实执行边界。
- 开发门/事实：规格第14、16章；归入DFR-018/019，fixed switch及下游继续阻断。

## Plan

- [x] 复核production builder/verifier只按Intake的`handoff_ref.path`读取versioned Handoff。
- [x] 复核trust guard比较`path/byte_length/sha256`完整ref。
- [x] 复核`37c5412a9c12...` source、`clean-37c5412a9c12`和当前fixed SHA。
- [x] 冻结独立postverify runner，不修改production trust语义。
- [x] 冻结subject/tool source分离与`4=1 M+3 A`实现allowlist。
- [x] 冻结四方raw join、Report、首错、原子输出和switch回滚。
- [x] 在隔离clean worktree实现tool source。
- [x] 执行真实fixed switch与postverify。

## Design Freeze

- [x] `Task Type=bugfix`和Active Playbooks已声明。
- [x] fixed/versioned路径允许不同、raw bytes必须相等的语义已冻结。
- [x] production verifier继续使用installed Intake/versioned Handoff。
- [x] fixed Intake、path fallback、`sameRef()`放宽均已禁止。
- [x] Report `0.1`字段、8项检查、状态和payload摘要已冻结。
- [x] final/staging唯一目录形状、父目录安全与既有final只读规则已冻结。
- [x] pre-acceptance与可报告invocation边界已冻结。
- [x] READY Report不是当前active状态、Activation或Capability证据。
- [x] READY Report与live fixed SHA、无pending marker联合守卫已冻结。
- [x] backup/candidate basename与backup唯一`SWITCH_PENDING`判据已冻结。
- [x] 原Versioned Handoff规格第10节由后继规格替代。

## Implementation

- [x] 新增Report Schema。
- [x] 新增`verify-canvas06-fixed-handoff-postswitch.mjs`。
- [x] 新增定向测试。
- [x] `package.json`新增runner/test入口且lockfile不变。
- [x] runner复用`loadReadyTrustChain({mode:'INSTALLED'})`。
- [x] runner通过`process.execPath`参数数组调用production verifier。
- [x] runner实现调用前后subject SHA复核。
- [x] runner实现Report payload SHA和单目录原子提交。

## Tool Source

- [x] isolated worktree以`37c5412a9c12c1b3ae06d6f7abe734804fa53c7b`为exact base且初始clean。
- [x] base..tool source精确`4=1 M+3 A`。
- [x] tool source单parent、非merge、worktree clean。
- [x] `package-lock.json`与base raw SHA相等。
- [x] runner/verifier/Schema raw SHA已记录。
- [x] tool source patch SHA已记录。

## Verify

- [x] `node --test scripts/verify-canvas06-fixed-handoff-postswitch.test.mjs`
- [x] `npm run release:canvas06:fixed-handoff:postverify:test`
- [x] fixed/versioned路径不同但raw相等正例通过。
- [x] production verifier只读取Intake/versioned Handoff正例通过。
- [ ] fixed/versioned/Manifest copy byte、length、SHA drift反例通过。
- [ ] fixed Intake、跨版本Intake、source/handoff/Manifest identity drift反例通过。
- [ ] 缺失、目录、symlink、hardlink、path escape反例通过。
- [ ] production verifier非零、stdout/stderr异常和subject drift反例通过。
- [x] pre-acceptance零Report、可报告失败BLOCKED Report边界通过。
- [x] final/staging冲突、Schema/payload错误和原子提交故障通过。
- [ ] READY后pending marker恢复时live guard拒绝孤立Report。

## Fixed Switch And Postverify

- [x] installed Intake/versioned Handoff/Manifest production预验通过。
- [x] fixed switch前无backup/candidate/pending残留。
- [x] 旧fixed bytes以exclusive backup marker保存并fsync。
- [x] candidate SHA等于versioned Handoff SHA。
- [x] single atomic rename与handoff root fsync完成。
- [x] postverify真实8项全部MATCHED。
- [x] READY Report已原子提交且payload SHA闭合。
- [x] backup marker删除并fsync父目录。
- [x] live fixed SHA等于Report且无pending marker。
- [x] installed versioned root、Intake和Manifest前后SHA不变。

## Failure And Rollback

- [ ] pre-acceptance失败零Report并恢复旧fixed SHA。
- [ ] BLOCKED Report保留且旧fixed exact SHA恢复。
- [ ] READY Report后pending恢复使该Report成为孤立历史证据。
- [ ] 新attempt使用新attempt ID且不覆盖既有Report root。
- [ ] `clean-a36a7f1fd709`和`clean-37c5412a9c12`均未修改、覆盖或删除。

## Evidence Slots

```text
subject_source_commit=37c5412a9c12c1b3ae06d6f7abe734804fa53c7b
subject_release_root=releases/clean-37c5412a9c12
subject_handoff_sha256=4088e449ebb04cb6cf94fe5393db4b72ee34cc96dd950cabfc1ad596b4afb3d2
fixed_handoff_before_sha256=0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326
verifier_tool_source_commit=2f2d0f96f9f4d6f86c1866ffea5bb51a9a5d970d
tool_source_delta=4=1M+3A
tool_source_patch_sha256=774b0b24465adfdc2c0707aba55d9f0270a0759095dd4279039d528b0cce7427
runner_source_sha256=30f2a06dfeaefeeaad08f49ebc1b7330f5531ad9381a25ef75cd0e1e2739cf30
production_verifier_source_sha256=df8655fb95767dd243b24c0112e2fc2e24ee9b3efc8a3c0d3ddaa06d2fd2a973
report_schema_sha256=6d00a8be722ae40eec410326c67515c53080f548a57ee0a8b801ba8e0ecbc4f5
attempt_id=c1a7e2b3d4f5061728394a5b6c7d8e9f
postverify_report_ref=postverify/releases/fixed-37c5412a9c12-4088e449ebb0-c1a7e2b3d4f5061728394a5b6c7d8e9f/fixed-handoff-postverify-report.json
postverify_report_payload_sha256=525ebd7cf675183bb1fa49d09e680f085494830ab63d76efdacf439804908dc1
production_verifier_result=MATCHED/0/dev-canvas-06-e2e-manifest.json
fixed_handoff_after_sha256=4088e449ebb04cb6cf94fe5393db4b72ee34cc96dd950cabfc1ad596b4afb3d2
pending_marker_after=0
subject_release_tree_before_sha256=827d780ca74dcee4fffe9c8ea5de901ee921270a1f4bc88b31d059eebde7d9f4
subject_release_tree_after_sha256=827d780ca74dcee4fffe9c8ea5de901ee921270a1f4bc88b31d059eebde7d9f4
```

## Release Boundary

- [x] fixed Handoff已按第11章切换并通过独立postverify/live guard。
- [x] 未修改两个已安装release root。
- [x] 已生成Schema-valid READY Report；未生成其他Gate Report。
- [x] 未生成E2E/Visual/Performance/Recovery READY Report。
- [x] 未生成GATE-06 Release Candidate或Activation，未启用Capability。
- [x] 未声明production release或ISO 19450:2024符合性。

## Current Conclusion

fixed path等价验证与installed Intake production trust已通过独立tool闭合。fixed Handoff已等于`clean-37c5412a9c12`的versioned raw bytes，READY Report与live guard均已形成。Family Identity Catalog已在新的clean Handoff/Evidence Bundle/活动Manifest闭合，Family Materializer可进入实现；production E2E Report及后续Gate继续阻断。
