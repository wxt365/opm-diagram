# Checklist: DEV-CANVAS-06 E2E Common Driver与受控编排实现

状态：`FROZEN/IN_PROGRESS`

## Task Type

- [x] `feature`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `frontend-vue`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | 项 |
| --- | --- | --- |
| 目标/输入 | 1、2 | D01~D03 |
| allowlist/非目标 | 3 | D04~D06 |
| 16 case driver | 4、5 | D07~D14 |
| 编排/事务 | 6、7 | D15~D22 |
| 测试/回滚/后继重建 | 8~10 | D23~D32 |

## Checklist

- [x] D01 Common Driver设计`v1.2`为唯一动作语义。
- [x] D02 Manifest/Attempt/Report活动版本均为`0.2`。
- [x] D03 OpenAPI、SQLite、Fault/Recovery边界未变化。
- [x] D04 非文档delta属于18路径allowlist。
- [x] D05 只增加三个test id与Fact删除已有API入口。
- [x] D06 无新依赖、test controller或生产测试开关。
- [x] D07 `COMMON_CASES`恰好16项同序且递归freeze。
- [ ] D08 初始状态、SETUP和subject baseline时机逐项相等。
- [x] D09 八类step的封闭JSON形状、T/X/R selector、有序`expected_apis[]`与全部`WAIT_API`一一对应，且`SUBMIT_TEXT_BLOCKED_COMMAND`输入绑定一致。
- [ ] D10 7 PASS/9 BLOCKED及137/57恒等式通过。
- [x] D11 九个BLOCKED错误/空码逐项相等。
- [x] D12 五种precondition一次性且raw evidence完整。
- [ ] D13 `ADVANCE_HEAD`后首错为`REVISION_CONFLICT`。
- [ ] D14 READONLY同时证明UI禁用与API 409。
- [ ] D15 controlled bundle只承担上游trust，不覆盖JAR/Web。
- [ ] D16 JAR/Web/Profile/four drivers从Manifest final root复制复核。
- [ ] D17 attempt root不存在且排他创建。
- [ ] D18 INITIAL/REOPEN使用新进程、同storage。
- [ ] D19 production Web无Vite/HMR/外网/checkout fallback。
- [ ] D20 固定等待无sleep。
- [ ] D21 端口和子进程退出证明完整。
- [ ] D22 失败不单独提交attempt或placeholder Report。
- [x] D23 driver unit正反例通过。
- [ ] D24 orchestration unit正反例通过。
- [x] D25 Vue selector与Fact删除测试通过。
- [ ] D26 16个controlled exact JAR/Web/Chromium正例通过。
- [ ] D27 三Fault/13普通INITIAL/16普通REOPEN装配正确。
- [ ] D28 Runner、lint、typecheck、build通过。
- [x] D29 `git diff --check`通过。
- [x] D30 回滚不删除release root或用户数据。
- [x] D31 未提升Report/Gate/Candidate/Activation/Capability/ISO状态。
- [x] D32 32个BASE/INPUT与Catalog raw ref不在本source delta，唯一后继为Common E2E输入重建规格/checklist。

## 当前门状态

- Build：`READY_FOR_BUILD/NOT_STARTED`。
- controlled 194/388：`BLOCKED_BY_MANIFEST_V02_EXACT_CLEAN_BASE_AND_COMMON_INPUT_REBUILD`。
- production：`NOT_RUN`。
