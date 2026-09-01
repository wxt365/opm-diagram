# Checklist: GOLDEN-AUTHORING-04 Approval 与 Publisher 实现

> 状态：`IN_PROGRESS`。机器 Approval 不替代外部人工审批，也不构成 release/ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-approval-publisher-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/范围/实现/测试/完成/回滚：映射规格第 1、4、5~6、8、10、11 节。

## Input Gate

- [x] Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Materializer `v1.5` 和 Verifier Catalog `v1.1` 仍为 `FROZEN`。
- [ ] 03A/03B verifier 已完成，candidate exact READY 且只读。
- [ ] 外部 Applicant/Approver/reason/time/approval authority 可用。

## Build

- [x] Approval Record `0.2` Schema/contract test 完成：INITIAL/SUPERSEDE、130/130 materialization、1242/9 assets、candidate/Environment 关联、approved path 和额外字段反例均由定向 AJV test 覆盖。
- [x] `golden:approve`、Approval verifier 和 fresh atomic writer完成；INITIAL/SUPERSEDE、人员分离、UTC 时间、candidate/environment/ref/digest closure 和 fresh output 的受控契约测试已通过。真实 Candidate/外部审批输入仍未执行。
- [x] INITIAL/SUPERSEDE Publisher、排他锁和 atomic version publish 完成；隔离完整 Candidate 已验证 `1.0.0` 原子发布，以及显式 predecessor join 后 `1.0.1` SUPERSEDE 发布；并发/故障注入仍在 Verify 项中保留。
- [x] `APPROVED_PUBLISHED` report builder 与只读 Golden Verifier 完成；公开 CLI 固定为 `--approved-version-root <absolute> --require-approved`。
- [x] approved layout 无 latest/symlink/overwrite/delete 路径；隔离发布后版本根精确为 1519 个常规文件，重复 publish 被阻断。

## Verify

- [x] candidate report raw/payload/attempt set、authored Environment、五类 refs 和全部 digest 闭合；隔离链路构造 130 Report、130 SQLite、1242 PNG、9 blank、3 font 后经 approve/publish/verify 全量复核。
- [ ] self-approve/person/time/reason/tamper/output-exists 反例阻断。
- [ ] INITIAL/SUPERSEDE/predecessor/no-op/SemVer 正反例通过；INITIAL 与 SUPERSEDE 成功链、重复 `1.0.0` 发布阻断及 predecessor exact join 已覆盖，非最高 predecessor/no-op/SemVer 反例仍待补齐。
- [ ] 双 writer、stale lock、copy/fsync/rename/post-verify 故障通过。
- [x] 旧 version 不变，verifier 零写入，失败输出符合边界；`1.0.1` 发布后 `1.0.0` 的 final report bytes 保持不变，postverify marker 存在时 verifier 拒绝消费。
- [ ] approve/publish/RSS 满足性能阈值。
- [ ] 定向命令、contract validate 和 `git diff --check` 通过。

## Risks And Residuals

- [x] approve/publisher 仍等待可验证的 03B `READY_FOR_APPROVAL` candidate；Golden Environment `0.2` Schema/离线 verifier 已实现，但不能用 Schema 正例替代 candidate 输入。
- [x] 受控工具测试未冒充真实人工审批/approved evidence；隔离测试只使用临时目录和合成字节，未写入 profile release root。
- [ ] Visual Manifest `0.2`、GATE-06-03、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [ ] 只回退 04 新增 Schema/runner/test/命令。
- [ ] 不删除 approved version、candidate、materialization 或用户数据。
