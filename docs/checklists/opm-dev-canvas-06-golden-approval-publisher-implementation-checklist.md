# Checklist: GOLDEN-AUTHORING-04 Approval 与 Publisher 实现

> 状态：`IN_PROGRESS`。机器 Approval 不替代外部人工审批，也不构成 release/ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-approval-publisher-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/范围/实现/测试/完成/回滚：映射规格第 1、4、5~6、8、10、11 节。

## Input Gate

- [x] Golden Authoring `v1.4`、Visual Common Materialization `v1.4`、Materializer `v1.5` 和 Verifier Catalog `v1.1` 仍为 `FROZEN`。
- [ ] 03A/03B verifier 已完成，candidate exact READY 且只读。
- [ ] 外部 Applicant/Approver/reason/time/approval authority 可用。

## Build

- [x] Approval Record `0.2` Schema/contract test 完成：INITIAL/SUPERSEDE、130/130 materialization、1242/9 assets、candidate/Environment 关联、approved path 和额外字段反例均由定向 AJV test 覆盖。
- [ ] `golden:approve`、Approval verifier 和 fresh atomic writer 完成。
- [ ] INITIAL/SUPERSEDE Publisher、排他锁和 atomic version publish 完成。
- [ ] `APPROVED_PUBLISHED` report builder 与只读 Golden Verifier 完成。
- [ ] approved layout 无 latest/symlink/overwrite/delete 路径。

## Verify

- [ ] candidate report raw/payload/attempt set、authored Environment、五类 refs 和全部 digest 闭合。
- [ ] self-approve/person/time/reason/tamper/output-exists 反例阻断。
- [ ] INITIAL/SUPERSEDE/predecessor/no-op/SemVer 正反例通过。
- [ ] 双 writer、stale lock、copy/fsync/rename/post-verify 故障通过。
- [ ] 旧 version 不变，verifier 零写入，失败输出符合边界。
- [ ] approve/publish/RSS 满足性能阈值。
- [ ] 定向命令、contract validate 和 `git diff --check` 通过。

## Risks And Residuals

- [x] approve/publisher 仍等待可验证的 03B `READY_FOR_APPROVAL` candidate；Golden Environment `0.2` Schema/离线 verifier 已实现，但不能用 Schema 正例替代 candidate 输入。
- [ ] 受控工具测试未冒充真实人工审批/approved evidence。
- [ ] Visual Manifest `0.2`、GATE-06-03、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [ ] 只回退 04 新增 Schema/runner/test/命令。
- [ ] 不删除 approved version、candidate、materialization 或用户数据。
