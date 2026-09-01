# Spec: GOLDEN-AUTHORING-04 Approval 与 Publisher 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 Approval Record `0.2` Schema、`golden:approve`、Approval verifier、Golden Verifier 和 immutable Publisher，把一个 exact `READY_FOR_APPROVAL` candidate 经 Applicant/Approver 分离审批后排他发布为 `APPROVED_PUBLISHED` version。本包不生成 candidate，不生成 Visual Manifest，不证明身份真实性。

## 2. 设计输入

唯一事实源为 Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2` 设计修正、Materializer `v1.5`、Verifier Catalog `v1.1`、Capture Plan `0.1`、Authoring Report `0.2` 和 Materialization Report `0.1`。实现不得改变 Approval 字段、candidate/new set SHA、INITIAL/SUPERSEDE、目录、错误码、性能或不可变边界。

## 3. 前置条件

1. `03A` semantic verifier、Golden Environment `0.2` verifier 和 `03B` candidate report verifier 已完成；
2. candidate report 为 exact `READY_FOR_APPROVAL`，candidate root 只读且 refs/SHA 全闭合；
3. Applicant/Approver、reason、外部评审引用和审批时间由发布流程显式提供；
4. 真实 publish 必须经过外部代码评审/发布审批，本工具只检查机器字段。

## 4. 修改边界

允许新增 Approval Record `v02` Schema、approve/verifier/publisher/Golden Verifier 脚本及测试、`tests/e2e/release/**` 隔离发布 fixture，并在 `package.json` 新增对应命令。禁止修改 `0.1` Schema、candidate bytes、SQLite/API/Vue/语义资产、Visual Manifest/runner、现有 approved version、Candidate/Activation。

## 5. Approve 实现

1. 严格实现主设计第 7、8 章命令/字段，output 必须 fresh；candidate root 必须精确为 `<change-root>/candidate`，Plan 与 `--out=<change-root>/approval-record.json` 必须位于同一普通 change root；
2. 先调用 Plan、Materialization、candidate report/content verifier，再验证人物非空且 ID 不同、reason/time/mode/version/predecessor；
3. Approval exact 记录 candidate report raw/payload/attempt set SHA、authored Golden Environment ref、130 Report、130 database、1242 PNG、9 blank、全部 font refs 和集合 SHA；font ref 路径遵循主设计 `environment/fonts/<font-relative-path>`，允许一个或多个普通相对段，禁止绝对路径、`.`、`..` 和空段；
4. candidate content、golden set 和 approval payload 三类 digest 独立复算；`INITIAL` 禁止 predecessor 输入，`SUPERSEDE` 必须接收显式 predecessor Authoring Report，验证其 `APPROVED_PUBLISHED` 状态、版本和 old golden set SHA 后规范化为 `versions/<old-version>/authoring-report.json`；
5. 在既有 change root 原子写 fresh `approval-record.json`；拒绝不生成 APPROVED 文件；已有文件不得覆盖。

## 6. Publisher 与 Golden Verifier

1. Publisher 只读取 Approval exact 指向的 candidate，禁止重新 author、重选文件或修补缺项；
2. INITIAL 只允许空 versions + `1.0.0`；SUPERSEDE 必须引用最高 SemVer predecessor，new version 更高且 new SHA 不同；
3. approved root 单写者排他锁，同文件系统临时 sibling 写入，复制 Plan、candidate report、Approval、03B authored Environment、130 Report/SQLite、fonts、1242 PNG、9 blank；Publisher 禁止重算 Environment；
4. Publisher 生成具有 `.approved.<golden-set-version>` 唯一 report ID 的 `APPROVED_PUBLISHED` Authoring Report `0.2`，再由 Golden Verifier 全量复核，最后 atomic rename；
5. rename 后 verify 失败时，Publisher 在 approved root 的固定 `quarantine/<golden-set-version>.postverify-failed.json` 原子写 Schema-valid postverify marker；Golden Verifier 和下游消费者必须在读取 version 前精确检查该 marker 并拒绝消费，禁止原地修复，只能新 SUPERSEDE；
6. Golden Verifier 永久只读，复核目录 allowlist、全部 Schema/raw/payload/set SHA、candidate/approval/final report/environment/predecessor exact join；
7. 不创建 `latest`、symlink、mutable pointer，不覆盖/删除/重命名既有 version。

## 7. 失败与退出码

输入/Schema/ref 无效为 `2`；candidate/approval/person/time/predecessor/SHA/lock/version 可归类阻断为 `3`；I/O/内部错误为 `4`。rename 前失败目标 version 零输出；Approval/Publisher temp 不得残留。rename 后失败不能伪装为成功或自动回退删除证据。

## 8. 测试与验收

必须覆盖 Approval `0.2` 正反 Schema、candidate raw/payload tamper、五类 refs/集合 SHA、人物冲突、时间、reason、fresh output；INITIAL/SUPERSEDE/no-op/非最高 predecessor/并发双 writer/stale lock；复制中断、fsync/rename/发布后 verify 故障；目录缺失/额外/symlink/path traversal；旧 version byte-for-byte 不变和 verifier 只读。Approve `<=10 min/RSS<=1 GiB`，publish+verify `<=20 min/RSS<=2 GiB`。

## 9. 验证命令

```text
npm run release:canvas06:golden-authoring-schema:test
npm run release:canvas06:golden:approve:test
npm run release:canvas06:golden:publish:test
npm run release:canvas06:golden:verify:test
npm run release:canvas06:golden:approve -- <受控 candidate/people/reason/time/out>
npm run release:canvas06:golden:publish -- <受控 plan/candidate/approval/root/version>
npm run release:canvas06:golden:verify -- <受控 approved-version/require-approved>
npm run contract:validate
git diff --check
```

## 10. 完成定义

Schema、approve、verifier、publisher、并发/故障/恢复测试和性能全部通过，且 checklist 记录 exact refs/SHA/命令。工具完成不等于真实人工批准或 production approved evidence；不得宣称 Visual/GATE/Candidate/Activation/Capability/ISO PASS。

## 11. 兼容与回滚

`0.1`、API、SQLite、产品配置不变。回滚只删除 04 新增代码/Schema/test/命令；不得删除已发布 version、candidate、materialization 或用户数据。已发布错误 version 只能由新 SUPERSEDE 修正。

## 12. 事实与假设

事实：当前 Approval `0.2`、approve/publisher/生产 Golden Verifier 和真实 approved version 未完成。假设：无。
