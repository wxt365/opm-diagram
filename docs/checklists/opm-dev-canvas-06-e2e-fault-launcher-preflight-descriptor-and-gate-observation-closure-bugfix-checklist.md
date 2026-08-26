# Checklist: DEV-CANVAS-06 E2E Fault Launcher Preflight Descriptor 与 Gate 观测闭包修正

状态：`FROZEN/COMPLETE`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 背景/复现/Root Cause | 1、2 | P01~P05 |
| 修正策略/版本/拓扑 | 3、4 | P06~P14 |
| Bundle/Descriptor 身份 | 5、6 | P15~P24 |
| JarIT/Environment/browser | 7 | P25~P32 |
| schedule/ports | 8、9 | P33~P42 |
| D10A/D10B | 10、11 | P43~P56 |
| 首错/实现包/原子事务 | 12、13 | P57~P68 |
| 验收/回滚/事实 | 14~16 | P69~P76 |

## Checklist

- [x] P01 已复现 Bundle `0.1` 没有 preflight descriptor ref。
- [x] P02 已复现 Manifest `0.2` 为封闭对象且没有该 ref。
- [x] P03 已复现旧 D10 把 preflight 与 execution 时间域混合。
- [x] P04 已确认当前没有三类新机器 Schema。
- [x] P05 Root Cause 已收敛为输入 owner 与执行观测 owner 未拆分。
- [x] P06 Manifest `0.2/0.2.0` byte shape 保持不变。
- [x] P07 Bundle `0.1` 固定为历史兼容。
- [x] P08 Fault Launcher 唯一消费 Bundle `0.2`。
- [x] P09 Descriptor/JarIT/Gate Observation 身份和 Schema 路径已冻结。
- [x] P10 Bundle -> Descriptor 引用方向已冻结。
- [x] P11 Descriptor 禁止引用 final Manifest，避免构建环。
- [x] P12 actual Manifest 由 D05 与 descriptor semantic join。
- [x] P13 production Manifest 禁止接受 Fault Launcher descriptor。
- [x] P14 不允许 Bundle `0.2` 回退为 `0.1`。
- [x] P15 Bundle `0.2` 第十个必填字段已冻结。
- [x] P16 descriptor ref 的 kind/path/root/link 规则已冻结。
- [x] P17 Bundle `0.2` identity JCS 公式已冻结。
- [x] P18 `approved_version_ref=null` 保持不变。
- [x] P19 Descriptor 顶层 13 字段封闭。
- [x] P20 generated_at 固定 UTC 整秒往返。
- [x] P21 Descriptor payload SHA 删除字段集合已冻结。
- [x] P22 descriptor ID 与 payload SHA 前 12 位绑定。
- [x] P23 禁止 raw SHA/bundle SHA/Manifest SHA 替代 payload SHA。
- [x] P24 Descriptor transitive refs 必须先验证后计算 identity。
- [x] P25 JarIT Report `0.1`、固定Maven命令和Surefire XML raw ref已冻结。
- [x] P26 JarIT 成功计数固定为 `6/6/0/0`。
- [x] P27 六个测试方法 ID、XML复算和顺序已冻结，禁止手写PASS。
- [x] P28 JarIT Report payload SHA 公式已冻结。
- [x] P29 Descriptor/JarIT/Manifest Runtime JAR 三方 join 已冻结。
- [x] P30 Golden Environment 必须为活动 `0.2`。
- [x] P31 Playwright/Chromium/color profile 固定值已冻结。
- [x] P32 browser CLI/descriptor/Environment 三方 raw identity 已冻结且禁止 fallback。
- [x] P33 三个 fault case 顺序已冻结。
- [x] P34 每个 case 的两次 attempt 顺序已冻结。
- [x] P35 每个 attempt 固定 `INITIAL -> REOPEN`。
- [x] P36 总计固定 `6 attempts/12 process cycles`。
- [x] P37 attempt ordinal 只能来自已验证 Plan 并与 schedule 交叉验证。
- [x] P38 六个 allocation ID 与 schedule 一一对应。
- [x] P39 12 个 loopback 端口必须全局互异。
- [x] P40 同 attempt 两个 cycle 只允许串行复用端口。
- [x] P41 preflight 和每个 cycle 前的端口复核已冻结。
- [x] P42 端口占用时禁止换号，必须重建 descriptor 和 bundle identity。
- [x] P43 Gate snapshot 复用 `DISABLED + [] + NOT_ACTIVE` value 形状。
- [x] P44 live fixed Handoff、activation root realpath与activation input set证据已冻结。
- [x] P45 空 activation set SHA 固定为 `4f53cda1...b945`。
- [x] P46 snapshot payload SHA 公式已冻结。
- [x] P47 Gate observer 固定为 parent Runner 内部只读 owner。
- [x] P48 observer 禁止新增公共 API 或修改 production wire。
- [x] P49 旧 `FLCP-D10-GATE` 已废止。
- [x] P50 preflight 第十项固定为 `FLCP-D10A-GATE-PREFLIGHT`。
- [x] P51 dependency result 仍恰 10 项。
- [x] P52 D10B 明确不属于 preflight dependency。
- [x] P53 BEFORE/DURING/AFTER 计数固定为 `1/12/1`。
- [x] P54 Gate Observation Artifact `0.1` 字段和摘要已冻结。
- [x] P55 成功必须 `14` 项一致且 mutation count 为 `0`。
- [x] P56 Gate 漂移稳定错误、立即停机和首错保留规则已冻结。
- [x] P57 preflight 唯一检查顺序已冻结。
- [x] P58 参数错误 exit `2` 与依赖阻断 exit `3` 已分离。
- [x] P59 BLOCKED 零执行/零输出副作用保持不变。
- [x] P60 READY 不得预写 D10B 或宣称 PASS。
- [x] P61 2A 状态已改为 descriptor contract implementation 阻断。
- [x] P62 `0dcaa27...` 继续作为 36 raw refs 来源，不再是 2A 直接 parent。
- [x] P63 后继 contract commit 必须先形成新 clean base intake。
- [x] P64 后继 allowlist 固定为 `12=4 M+8 A`。
- [x] P65 12 个路径逐字符冻结。
- [x] P66 活动 Manifest/Report/Source Set/Fault Plan/36 baseline 均禁止修改。
- [x] P67 Producer staging、fsync、atomic install 和 installed verify 顺序已冻结。
- [x] P68 Gate Observation 不得由 input producer 预生成。
- [x] P69 正例覆盖 Bundle/descriptor/transitive join、D10A 和 14 项 D10B。
- [x] P70 反例覆盖版本错配、SHA 漂移、JarIT 不完整、schedule/port/Gate 漂移。
- [x] P71 production Manifest 消费 Fault Launcher input 被定义为反例。
- [x] P72 回滚不得恢复旧 D10 或直接从 `0dcaa27...` 实施 2A。
- [x] P73 本设计未创建 Schema、producer/verifier、2A 或 release 资产。
- [x] P74 Gate/Candidate/Activation/Capability/ISO 状态未提升。
- [x] P75 事实与待实现已分栏。
- [x] P76 Spec Mapping 覆盖目标、范围、非目标、约束、验收、验证和回滚。

## 当前门状态

- 设计修正：`COMPLETE`。
- Preflight Contract 实现：`FROZEN_FOR_IMPLEMENTATION/NOT_STARTED`。
- Fault Launcher 2A：`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`。
- Controlled Playwright：`NOT_RUN`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。
