# Checklist: DEV-CANVAS-06 E2E Common Driver与受控编排实现

状态：`FROZEN/IN_PROGRESS`

## Task Type

- [x] `feature`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `frontend-vue`
- [x] `backend-springboot`（Snapshot CLI只读闭包）
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | 项 |
| --- | --- | --- |
| 目标/输入 | 1、2 | D01~D03 |
| allowlist/非目标 | 3 | D04~D06 |
| 16 case driver | 4、5 | D07~D14 |
| 编排/事务 | 6、7 | D15~D22、D37~D44 |
| 测试/回滚/后继重建 | 8~10 | D23~D36、D45 |

## Checklist

- [x] D01 Common Driver与受控编排设计`v1.13`为唯一动作、State Snapshot、Transaction Snapshot、base/working SQLite、cycle nonce、Attempt Observation和Artifact Index语义。
- [x] D02 Manifest/Attempt/Report活动版本均为`0.2`。
- [x] D03 OpenAPI、SQLite、Fault/Recovery边界未变化。
- [x] D04 实际非文档source delta为`50`路径；精确allowlist已同步至本规格第3.1节。两个Snapshot executable正例复用既有Materializer JarIT owner，参数反例复用既有Snapshot CLI测试owner，Projection Digest修正只扩展API adapter与两端定向测试；Materializer/Report verifier承接base/working P0闭包。
- [x] D05 只增加三个test id与Fact删除已有API入口。
- [x] D06 无新依赖、test controller或生产测试开关。
- [x] D07 `COMMON_CASES`恰好16项同序且递归freeze。
- [ ] D08 初始状态、SETUP和subject baseline时机逐项相等。
- [x] D09 八类step的封闭JSON形状、T/X/R selector、有序`expected_apis[]`与全部`WAIT_API`一一对应，且`SUBMIT_TEXT_BLOCKED_COMMAND`输入绑定一致。
- [ ] D10 7 PASS/9 BLOCKED及137/57恒等式通过。
- [x] D11 九个BLOCKED错误/空码逐项相等。
- [x] D12 五种precondition一次性且raw evidence完整。
- [x] D13 `ADVANCE_HEAD`后首错为`REVISION_CONFLICT`。
- [x] D14 READONLY同时证明UI禁用与API 409。
- [x] D15 controlled bundle只承担上游trust，不覆盖JAR/Web；production Context只复核Intake/Handoff，不进入Controlled Bundle verifier。
- [x] D16 JAR/Web/Profile/four drivers从Manifest final root复制复核。
- [x] D17 attempt root不存在且排他创建。
- [ ] D18 INITIAL/REOPEN使用新进程、同storage。
- [ ] D19 production Web无Vite/HMR/外网/checkout fallback。
- [ ] D20 固定等待无sleep。
- [ ] D21 端口和子进程退出证明完整。
- [ ] D22 失败不单独提交attempt或placeholder Report。
- [x] D23 driver unit正反例通过。
- [x] D24 orchestration unit正反例通过；Runner Node 22当前`120/120`，真实进程/浏览器矩阵仍由D26单独约束。
- [x] D25 Vue selector与Fact删除测试通过。
- [ ] D26 16个controlled exact JAR/Web/Chromium正例通过。
- [ ] D27 三Fault/13普通INITIAL/16普通REOPEN装配正确。
- [x] D28 Runner、lint、typecheck、build通过。
- [x] D29 `git diff --check`通过。
- [x] D30 回滚不删除release root或用户数据。
- [x] D31 未提升Report/Gate/Candidate/Activation/Capability/ISO状态。
- [x] D32 32个BASE/INPUT与Catalog raw ref不在本source delta，唯一后继为Common E2E输入重建规格/checklist。
- [x] D33 semantic comparison只纳入同序`assertion_id/status`，完整evidence refs继续独立校验，attempt路径不进入摘要。
- [x] D34 Browser Environment fingerprint的`0.1`版本化preimage、raw SHA来源和排除字段已冻结。
- [x] D35 exact Runtime JAR Snapshot CLI及Node调用桥的参数、同attempt信任、`immutable=1 + READONLY + query_only`零sidecar SQLite读取、Profile/Projection输入、stdout shape、上限与错误码已冻结；Java CLI与Node桥已实现，真实forked-JAR验收进行中。
- [x] D36 Projection Digest Closure `v1.1`冻结正式data到既有`0.1` digest view的唯一adapter；`suppressed_states`不重解释历史SHA，由Revision digest、raw evidence和deep comparison保护。
- [x] D37 Transaction Snapshot CLI、Node桥及forked-JAR as-of before/after正反例通过，且不新增HTTP、活动WAL读取或expected delta反推；Runner在INITIAL停机后写正式`transaction-observation.json`，再进入REOPEN。
- [x] D38 Materializer生成不可变base并原子克隆working；Runner在启动前验证初始bytes相等，Snapshot读取working，Report verifier保持base raw identity且允许working正常变化；base drift/working缺失/路径互换/sidecar反例通过。
- [x] D39 Runtime Process两个cycle使用不同Runner-owned nonce，仅Fault INITIAL与Plan nonce相等；Reopen artifact逐字段复用两个cycle nonce，producer/verifier正反例通过。
- [x] D40 Context producer/loader建立并复核Report全局Java/Chromium mirror，实际执行path与Attempt相对evidence ref不混用；version/release/source/mirror drift正反例通过。
- [ ] D41 Runtime/Browser cycle机器证据按`v1.11`闭合：Context ID、真实Chromium版本、REOPEN实际摘要、三次连续UP、日志上限、termination和normalized command正反例通过。
- [ ] D42 Network/Console按`v1.13`从同一Playwright事件流采集，两个cycle序号连续，API ref复用且五类counter/拒绝事件正反例通过。
- [x] D43 活动194 case的10类assertion全集、subject command边界、SETUP/ADVANCE_HEAD排除与baseline重绑、八个Attempt字段来源及`detail_error_code=null`已冻结。
- [x] D46 `PROJECTION_UNCHANGED`缺失Revision document摘要的设计冲突已修正：Attempt新增三字段，semantic digest与Report `reopen_matches`唯一派生规则已冻结于主设计`v1.14`。
- [x] D44 producer/verifier独立闭合subject before/after/reopen、assertion exact evidence refs和Materializer base/Attempt final Head边界；Report verifier `19/19`正反例通过。
- [x] D45 Artifact Index闭合10核心、5 Profile资产、1 tree、4 log、全部API raw refs及实际文件全集；Attempt Artifact `10/10`与完整Runner正反例通过。

## 当前门状态

- Build：`IN_PROGRESS/PARTIAL`；Common Plan、CaseExecution、SETUP binder、session主路径已实现。
- controlled 194/388：`BLOCKED_BY_EXACT_CONTROLLED_INPUTS_AND_REAL_BROWSER_EVIDENCE`；Attempt Artifact和Report verifier闭包已完成，但尚未取得exact Runtime/Web/Chromium受控输入并执行真实矩阵。
- production：`NOT_RUN`。
