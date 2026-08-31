# Spec: GOLDEN-AUTHORING-05 Visual Manifest 0.2 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 Visual Manifest `0.2` Schema、builder 和只读 verifier，使 GATE-06-03 只能从一个显式、完整、已批准且通过 Golden Verifier 的 immutable version 生成生产 Manifest，并 exact 绑定 Authoring Report、Approval、Golden Environment、Capture Plan、130 项 Materialization 和 golden set。

## 2. 设计输入

唯一事实源为 Golden Authoring `v1.4` 第 10 章、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2` 设计修正、DEV-CANVAS-06 第 4.4 节、`opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md`，以及 Visual Manifest `0.1` 历史 Schema。修正规格唯一承接 builder owner、Visual/E2E 版本决定、approved transitive exact join 和 bundle class/root/identity；本规格不得建立第二套输入规则。`0.2` 保留 `0.1` 全部字段/计数/顺序，只新增设计冻结的八个必填 provenance 字段和 `0.2.0` generator identity。

## 3. 前置条件

1. 04 Golden Verifier 已实现；
2. 输入是显式 `approved/versions/<semver>`，不接受 approved parent、latest、candidate 或目录扫描；
3. Authoring Report 为 `APPROVED_PUBLISHED`，Approval 为 `APPROVED`，Golden Environment `0.2`、Plan 和所有 refs 可复算。
4. `--input-mode`、bundle root、bundle identity 和输出 root 通过输入修正规格的 class 隔离守卫。

## 4. 修改边界

允许新增 `opm-dev-canvas-06-visual-manifest-v02.schema.json`、独立 Visual 0.2 builder/verifier 及定向测试、必要 `tests/e2e/release/**` fixture 和 package 命令。禁止创建 Visual/E2E 合并 builder，禁止修改 Manifest `0.1`、E2E `0.1`、approved bytes、Golden Authoring/Materializer/Approval Schema、产品 API/SQLite/Vue/语义资产、Visual Report/runner、Candidate/Activation。

## 5. 实现契约

1. CLI 必须接收 exact Intake/Handoff/source build 和 `--approved-version-root`，输出路径 fresh；
2. 写任何 bytes 前调用 Golden Verifier `--require-approved` 并完成主设计第 10 章九项守卫；
3. 八个新增字段与 final Authoring Report、Approval、Plan 和目录 version exact 相等；
4. `golden_environment_ref`、1242 PNG、9 blank、378 case、306/72 分组和所有 variant `golden_ref` 保持既有冻结顺序；
5. Manifest 只引用 approved version 内 raw bytes，不复制、重写、补齐或扫描猜测资产；
6. builder 采用 fresh temp、Schema/semantic verify、fsync、atomic rename；任一失败目标/临时文件零输出；
7. verifier 只读复算 Schema、所有 raw SHA、八字段、case/capture 集合、Environment 和 Golden Authoring transitive closure。
8. 一次调用只生成 Visual `0.2`；`CONTROLLED_TEST` 与 `PRODUCTION_HANDOFF` 必须使用不同 bundle identity/root，production verifier 拒绝受控输入和受控输出。

## 6. 稳定失败

沿用主设计 `VISUAL_GOLDEN_*` 映射：缺/未批准 Authoring、Approval 无效、capture/set/environment/golden digest 不一致均退出 `3`；输入/Schema/ref 非法退出 `2`；I/O/内部错误退出 `4`。禁止生成 `BLOCKED` Manifest、接受 `0.1` 作为生产输入或降级忽略新增字段。

## 7. 测试与验收

必须覆盖 `0.2` Schema 正反例、八字段缺失/错值、`0.1` production 拒绝、candidate/latest/parent 拒绝、Approval/Report/Environment/Plan/materialization/database/PNG/blank/font 任一 tamper、缺失/额外/symlink、378/1242 顺序和计数、两类 bundle class/root/identity 正反例、跨 class 互用拒绝、writer 故障零输出、verifier 只读。builder/verifier 各 `<=10 min`、peak RSS `<=1 GiB`。

## 8. 验证命令

```text
npm run release:canvas06:visual-manifest-v02-schema:test
npm run release:canvas06:visual-manifest-v02:test
npm run release:canvas06:visual:manifest -- --input-mode <CONTROLLED_TEST|PRODUCTION_HANDOFF> <exact inputs/approved-version/out>
npm run release:canvas06:visual:manifest:verify -- --input-mode <CONTROLLED_TEST|PRODUCTION_HANDOFF> <manifest/approved-version> [--require-production]
npm run contract:validate
git diff --check
```

## 9. 完成定义

Schema、builder、verifier、全部正反/故障/性能测试通过，Manifest 与 approved version exact 闭合，checklist 记录版本、命令和 SHA。工具完成不等于真实生产 Manifest、Visual Report、GATE-06-03、Candidate、Activation、Capability 或 ISO PASS。

## 10. 兼容与回滚

`0.1` 文件保持不变但禁止生产消费；API/SQLite/产品配置不变。回滚只删除 05 新增 Schema/runner/test/命令，不修改 approved version 或已生成证据；回滚后生产 Visual Gate 保持 BLOCKED。

## 11. 事实与假设

事实：当前 `0.1` 缺 authoring provenance；`0.2` Schema 和定向 contract test 已完成，builder/verifier、受控 bundle descriptor 和生产 Manifest 尚未完成。旧 Visual/E2E 合并 builder 规格已是历史版本。假设：无。
