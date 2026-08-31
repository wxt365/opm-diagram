# Checklist: DEV-CANVAS-06 E2E Common Driver与受控编排实现

状态：`FROZEN/BLOCKED_BY_STAGE_A_LIFECYCLE_IMPLEMENTATION`

## Task Type

- [x] `feature`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | 项 |
| --- | --- | --- |
| 目标/输入 | 1、2 | D01~D03 |
| allowlist/只读前置 | 3 | D04~D09 |
| 既有Driver/Common输入 | 4、5 | D10~D15 |
| 编排/事务 | 6、7 | D16~D23 |
| 测试/回滚/状态 | 8~10 | D24~D34 |

## Checklist

- [x] D01 本规格历史起点为Common Driver设计`v1.8`；活动动作与precondition机器语义由`v1.9`及Common Precondition closure后继取代，Stage A lifecycle closure继续有效。
- [x] D02 Manifest/Attempt/Report活动版本均为`0.2`。
- [x] D03 OpenAPI、SQLite、Fault/Recovery边界未变化。
- [x] D04 非文档delta固定为`8=7 M+1 A`。
- [x] D05 `runControlledLifecycleSession()`唯一owner为`release-canvas06-e2e-run.mjs`；`prepareControlledAttempt()`仅内部使用。
- [x] D06 四个production路径均已在Runner Source Set `0.1`的23项中。
- [x] D07 四个测试路径继续属于Source Set排除集。
- [x] D08 不新增独立orchestration production helper、第二CLI或Source Set `0.2`。
- [x] D09 Report保持`0.2/runner_version 0.2.0`。
- [x] D10 现有`COMMON_CASES`恰好16项同序且递归freeze。
- [x] D11 八类step、T/X/R selector、有序`expected_apis[]`与错误/事务口径已由现有driver承接。
- [x] D12 Common Driver及其测试只读，不重复修改。
- [x] D13 三个selector、Fact删除入口与store只读，不重复修改。
- [x] D14 Common factory及其测试只读，不重复修改。
- [x] D15 活动43文件root的self-verified状态不解释为production证据。
- [ ] D16 在Runner入口实现`runControlledLifecycleSession()`，不增加Runtime/Web override CLI。
- [ ] D17 JAR/Web/Profile/four drivers从Manifest final root复制复核。
- [ ] D18 attempt root不存在且排他创建。
- [ ] D19 lifecycle接口严格执行INITIAL/REOPEN新Runtime/Web、同storage和端口回收；六方法sink逐cycle完成Page绑定、同Page网络观测、`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED`及最终Browser关闭证明。
- [ ] D20 production Web无Vite/HMR/外网/checkout fallback。
- [ ] D21 固定等待无sleep。
- [ ] D22 端口和子进程退出证明完整。
- [ ] D23 失败不单独提交attempt或placeholder Report。
- [x] D24 既有driver unit正反例通过记录只作为局部证据。
- [ ] D25 Runner编排unit正反例通过，覆盖duplicate/late/cross-cycle attach、错误对象、关闭事件缺失、pending请求、重复confirm、confirm后迟到事件、监听空窗、sentinel提前移除和最终残留。
- [ ] D26 既有Vue selector与Fact删除回归通过；失败回流产品owner，不在本包修改。
- [ ] D27 16个controlled exact JAR/Web/Chromium正例通过。
- [ ] D28 三Fault/13普通INITIAL/16普通REOPEN装配正确。
- [ ] D29 Runner、lint、typecheck、build通过。
- [ ] D30 17项final commit中的Common职责子集精确为`8=7 M+1 A`，且不得存在独立Common commit。
- [ ] D31 Source Set仍为23项且aggregate包含四个变更production文件的新bytes。
- [ ] D32 `git diff --check`通过。
- [x] D33 回滚不删除只读能力、release root或用户数据。
- [x] D34 未提升Report/Gate/Candidate/Activation/Capability/production/ISO状态。

## 当前门状态

- Build：`BLOCKED_BY_STAGE_A_LIFECYCLE_IMPLEMENTATION`。
- controlled `194/388`：`BLOCKED_BY_MANIFEST_V02_EXACT_CLEAN_BASE_FAULT_LAUNCHER_AND_ORCHESTRATION`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。
- production：`NOT_RUN`。
