# Checklist: DEV-CANVAS-06 Common Visual Clone CLI 与 Web Runtime Protocol 闭包 Bugfix

状态：`DESIGN_FROZEN / PARTIAL_IMPLEMENTATION / CONTROLLED_SINGLE_CASE_PROOF_ONLY`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、复现、Root Cause | 1、2 | C01~C08 |
| Launch mode与生命周期 | 3、4 | C09~C19 |
| Clone CLI/Result | 5 | C20~C34 |
| Web Runtime/Ready/端口 | 6 | C35~C55 |
| 关闭、exit、首错 | 7~9 | C56~C68 |
| 实现边界、验收、回滚 | 10~12 | C69~C82 |

## Checklist

- [x] C01 已确认当前Node adapter不能调用可执行clone接口。
- [x] C02 已确认当前Web Runtime无固定启动/端口/READY协议。
- [x] C03 已确认`LocalRuntimeApplication`对任意release profile统一退出。
- [x] C04 已确认全局exception mapping把Common UI setup返回2。
- [x] C05 已确认VisualCommon runner局部switch返回3，存在双owner。
- [x] C06 Root Cause已收敛为逻辑顺序未落到可执行进程契约。
- [x] C07 本修正不实现代码或144次调度。
- [x] C08 公共HTTP/SQLite/Profile业务bytes保持不变。
- [x] C09 profile与launch mode职责分离。
- [x] C10 四个release mode封闭枚举已冻结。
- [x] C11 GFM/Base/Clone固定non-web有限任务。
- [x] C12 Common Web固定servlet长驻任务。
- [x] C13 主入口只对三个有限mode调用Spring exit。
- [x] C14 Common Web禁止主动exit。
- [x] C15 mode缺失/未知/重复在storage/port前拒绝。
- [x] C16 mode不得由env/system/default推断。
- [x] C17 Family GFM condition/guard排除全部Common mode。
- [x] C18 E2E/Recovery/default生命周期不变。
- [x] C19 Base现有CLI补充exact runtime mode。
- [x] C20 Clone CLI参数集合与顺序已冻结。
- [x] C21 Clone只允许exact Java 21与outer Runtime JAR。
- [x] C22 Clone所有应用参数只来自commandLineArgs且各一次。
- [x] C23 base/attempt路径fresh、empty、non-overlap、no-symlink。
- [x] C24 base attestation/raw ref/identity/tree/sidecar必须闭合。
- [x] C25 copy后clone database/raw/integrity/FK/sidecar复核。
- [x] C26 clone后base digest必须不变。
- [x] C27 Clone Result Schema `0.1/0.1.0`已定义。
- [x] C28 Clone Result固定READY_FOR_RUNTIME。
- [x] C29 Result绑定request/capture/subject/attempt/epoch。
- [x] C30 Result绑定base/attempt refs和before/after/tree摘要。
- [x] C31 payload SHA公式已冻结。
- [x] C32 写入固定temp/fsync/no-replace rename/parent fsync。
- [x] C33 失败final结果为零，清理只限本进程fresh root。
- [x] C34 Normalized Result的attempt_storage_ref唯一投影已冻结。
- [x] C35 Web唯一命令与参数已冻结。
- [x] C36 Web使用verified Profile五资产root，复用Manifest UTF-8 path顺序且禁止checkout fallback/类型重排。
- [x] C37 application固定127.0.0.1和port 0。
- [x] C38 management显式固定loopback/独立port 0，只暴露health并启用readiness probe。
- [x] C39 OS是唯一端口分配owner。
- [x] C40 Node禁止预选、扫描、日志解析和换端口重试。
- [x] C41 两端口必须合法且不同，无额外connector。
- [x] C42 launch nonce固定64 lowerhex。
- [x] C43 Runtime Ready Schema `0.1/0.1.0`已定义。
- [x] C44 READY绑定PID、两端口、JAR/Profile/clone/tree与nonce。
- [x] C45 READY只在ApplicationReady和两个WebServer初始化后写入。
- [x] C46 READY前必须复核storage与fault subject模式。
- [x] C47 Ready payload SHA公式已冻结。
- [x] C48 Ready原子写入顺序已冻结。
- [x] C49 Node固定30秒monotonic deadline与100ms poll。
- [x] C50 child存活与PID exact join必须通过。
- [x] C51 management readiness必须200、无redirect、status=UP。
- [x] C52 application bootstrap必须200、JavaScript和既有wire shape。
- [x] C53 四项READY条件全通过后才能调用callback。
- [x] C54 timeout/child exit/health/bootstrap/port失败统一UI_SETUP_FAILED/3。
- [x] C55 禁止mock Runtime、stdout READY和同attempt重启。
- [x] C56 callback结束固定SIGTERM与10秒deadline。
- [x] C57 SIGKILL只用于失败清理，不能转成功。
- [x] C58 关闭后child与两端口必须消失。
- [x] C59 SQLite sidecar、attempt tree和base digest必须复核。
- [x] C60 CLOSED只有完整关闭验证后可写。
- [x] C61 正常exit/signal集合已冻结。
- [x] C62 exitCodeFor是唯一Java错误码owner。
- [x] C63 Common input/operational/internal三档2/3/4已冻结。
- [x] C64 GOLDEN_COMMON_UI_SETUP_FAILED固定exit 3。
- [x] C65 runner禁止第二份switch。
- [x] C66 未知code不能从已验证Common路径产生。
- [x] C67 首错顺序已覆盖clone/ready/health/shutdown。
- [x] C68 失败零partial normalized/READY证据。
- [x] C69 后继职责路径allowlist已列明。
- [x] C70 既有14项Adapter/Fault职责保持原owner。
- [x] C71 clean base与M/A/patch SHA留给后继实现任务冻结。
- [x] C72 不从dirty worktree推断source identity。
- [x] C73 正例覆盖四mode生命周期。
- [x] C74 反例覆盖mode/profile/web type错配。
- [x] C75 Clone CLI正反例矩阵已冻结。
- [x] C76 动态端口并发与禁止端口策略已冻结。
- [x] C77 Ready artifact单变量篡改矩阵已冻结。
- [x] C78 shutdown/fault/sidecar/base drift矩阵已冻结。
- [x] C79 packaged JAR三条UI_SETUP_FAILED路径必须exit 3。
- [x] C80 8/144严格串行和首错停止已冻结。
- [x] C81 default/03A/E2E/Recovery/HTTP回归边界已冻结。
- [x] C82 回滚、风险、事实与非结论已冻结。
- [x] C83 Request/Handoff/Plan使用`LOCAL_RUNTIME_JAR` source ref；Runtime Ready保持`RUNTIME_JAR` staged ref，仅raw identity闭合。

## Validation

- [x] 两份新增Schema通过Ajv Draft 2020-12 strict编译及2正3负受控校验。
- [x] 活动设计、实现规格、测试策略、执行包、冻结基线和README同步完成。
- [x] Markdown本地链接检查通过。
- [x] `git diff --check`通过。

## 当前门状态

- Clone/Web Runtime设计：`FROZEN_FOR_IMPLEMENTATION`。
- Java Base/Clone/Web：已有单个`STATE_ROLES` packaged-JAR局部验证，不构成完整03C验收。
- Node adapter：`NODE_ADAPTER_BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION`。
- 8 base/144 clone：`NOT_RUN`。
- one-shot fault hook完整验收：`PARTIAL_NOT_ACCEPTED`。
- 03B Candidate：`BLOCKED_BY_DEPENDENCY`。
- GATE/Capability/production/ISO：不提升。
