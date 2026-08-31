# Checklist: DEV-CANVAS-06 Stage A Controlled Lifecycle Interface Closure

状态：`SOURCE_IMPLEMENTED / VERIFIED / CONTROLLED_EXECUTION_NOT_RUN`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、Root Cause、Fix Strategy | 1~3 | L01~L08 |
| 修改边界与唯一接口 | 4~5 | L09~L20 |
| Common Driver client与Browser proof owner | 6 | L21~L36 |
| Runtime/Web lifecycle | 7 | L37~L48 |
| D10B与cleanup顺序 | 8 | L49~L60 |
| 返回值、错误码、Stage A guard | 9~10 | L61~L75 |
| 验收、回滚、状态边界 | 11~12 | L76~L85 |

## Design Checklist

- [x] L01 已复现`prepareControlledAttempt()`不等于完整lifecycle接口。
- [x] L02 已复现Runtime/Web spawn、READY、INITIAL/REOPEN和cleanup owner未封闭。
- [x] L03 已复现Common Driver client factory owner未冻结。
- [x] L04 已复现D10B sampler与Artifact writer可被spec自行实现。
- [x] L05 Root Cause覆盖attempt接口被误当成session接口。
- [x] L06 后继修正规格将Stage A闭合为七项allowlist；生命周期语义仍只归两个Runner owner。
- [x] L07 不新增Schema、公共API、配置或source path。
- [x] L08 本轮只补设计，不创建A commit。
- [x] L09 唯一接口名固定为`runControlledLifecycleSession()`。
- [x] L10 owner固定为`release-canvas06-e2e-run.mjs`。
- [x] L11 生命周期测试owner固定为`release-canvas06-e2e-run.test.mjs`；discovery/source guard测试由后继规格单独授权。
- [x] L12 四个参数逐项冻结，无第二options或override。
- [x] L13 Context/Manifest/Descriptor exact join已冻结。
- [x] L14 handler map固定6 schedule乘2 cycle。
- [x] L15 handler唯一参数为`origin/observation_sink`。
- [x] L16 handler返回值固定为`undefined`。
- [x] L17 origin固定为verified loopback Web origin。
- [x] L18 handler不得推断case、attempt或cycle。
- [x] L19 `prepareControlledAttempt()`只允许接口内部调用。
- [x] L20 spec不得复制spawn/READY/cleanup逻辑。
- [x] L21 observation sink由接口逐cycle构造。
- [x] L22 precondition client由接口逐cycle构造并嵌入sink。
- [x] L23 两个client均深冻结且禁止跨cycle复用。
- [x] L24 spec只能把嵌入client原样传给Common Driver。
- [x] L25 precondition只走当前Runtime正式API。
- [x] L26 raw request/actual request/response必须进入attempt observation。
- [x] L27 禁止SQLite/test controller/Vue store旁路。
- [x] L28 sink关闭后的迟到调用固定拒绝。
- [x] L29 sink顶层形状固定为六方法，新增项仅为`attachBrowserPage/confirmBrowserClosed`。
- [x] L30 attach固定每cycle一次，早于route/navigation/API/Common Driver。
- [x] L31 Runner只从Page取得同树Context/Browser并以对象引用保存身份。
- [x] L32 wait方法只消费当前绑定Page的有序request/response/requestfailed事件。
- [x] L33 confirm固定在handler finally关闭page/context/browser后，以相同对象引用调用一次。
- [x] L34 Page close、Context close、Browser disconnected与零pending网络观测只形成临时关闭确认；最终proof等待handler settle、零late flag和sink关闭。
- [x] L35 confirm后业务采样立即冻结，最小迟到事件sentinel无间隙保留到handler settle；随后按late复核、sink关闭、sentinel拆除顺序进入`CLOSED`。
- [x] L36 duplicate/late/cross-cycle attach、错误对象、缺失/重复confirm、confirm后事件、监听空窗和sentinel提前/残留均拒绝；接口参数、handler返回和Schema不变。
- [x] L37 6 schedule与12 cycle顺序冻结。
- [x] L38 INITIAL完全cleanup后才能REOPEN。
- [x] L39 REOPEN复用同attempt storage。
- [x] L40 每cycle fresh Runtime/Web child。
- [x] L41 Runtime exact READY先于Web启动。
- [x] L42 Web health/bootstrap READY先于handler。
- [x] L43 spec逐cycle通过`finally`关闭fresh Chromium process/context/page并调用关闭确认，不拥有Runtime/Web child；Browser证明不闭合固定`EVIDENCE_TRANSACTION/4`。
- [x] L44 父Node owner拥有Playwright test child最终终止；三类child不得混淆。
- [x] L45 SIGTERM/等待/SIGKILL身份边界冻结。
- [x] L46 禁止终止未知PID。
- [x] L47 challenge移除位置冻结。
- [x] L48 cleanup后必须证明端口无listener。
- [x] L49 D10A仍归父Node preflight owner。
- [x] L50 D10B三类采样均归lifecycle接口。
- [x] L51 BEFORE位于任何Runtime/Web启动前。
- [x] L52 DURING位于handler成功、临时确认、handler settle、零迟到事件、sink/sentinel完整关闭、Browser proof最终成立、child终止和端口释放后。
- [x] L53 DURING只能形成完整cycle有序前缀。
- [x] L54 AFTER位于全部已启动child cleanup后。
- [x] L55 Gate首错立即停止后续cycle。
- [x] L56 handler首错立即停止后续cycle。
- [x] L57 Artifact writer唯一归lifecycle接口。
- [x] L58 spec与父owner均禁止直接写Artifact。
- [x] L59 tmp/fsync/reread/no-replace rename/directory fsync顺序冻结。
- [x] L60 Browser proof、cleanup或Artifact不可信固定`EVIDENCE_TRANSACTION/4`，不得采样当前DURING或提交可消费Artifact。
- [x] L61 `ControlledLifecycleResult`字段和范围已冻结；process count只统计Runtime/Web，`released_port_count`按Descriptor 12个唯一端口去重，24次cycle释放检查不重复计数。
- [x] L62 PASS要求6 schedule/12 cycle完整闭合。
- [x] L63 FAILED只允许真实完成前缀且residual为0；`completed_schedule_ids`只记录双cycle均完成的schedule。
- [x] L64 Gate Artifact ref kind/path固定。
- [x] L65 input/ref/fresh/process/port错误码映射已冻结。
- [x] L66 Browser proof内部码固定为`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID`并升级为`EVIDENCE_TRANSACTION/4`。
- [x] L67 Gate与controlled execution failure code已冻结。
- [x] L68 cleanup失败不得返回结果或提交可消费Artifact。
- [x] L69 Gate mutation高于handler业务错误；Browser proof/证据事务失败最终优先于二者。
- [x] L70 lifecycle接口实现前A commit固定禁止。
- [x] L71 A patch SHA保持`NOT_CREATED`。
- [x] L72 D10B与controlled evidence保持`NOT_RUN/NOT_CREATED`。
- [x] L73 D01~D10A工具验证允许继续，但不得伪造D01 READY。
- [x] L74 A commit准入由后继修正为七项delta、接口/discovery/source guard测试、零复制和source clean。
- [x] L75 R必须保持A lifecycle接口与回归。
- [x] L76 正例覆盖session、六方法sink、Page网络事件、临时确认、sentinel持续期、最终Browser proof、READY、D10B、cleanup和返回值。
- [x] L77 反例覆盖attach/confirm/object/event/pending、confirm后采样、监听空窗、sentinel提前/残留、handler、client、顺序、进程、端口、Gate和Artifact。
- [x] L78 文档任务无需运行Runtime/Playwright。
- [x] L79 contract validate纳入验证。
- [x] L80 Markdown链接与活动冲突扫描纳入验证。
- [x] L81 `git diff --check`纳入验证。
- [x] L82 回滚不得恢复spec自行编排。
- [x] L83 当前session接口首轮实现已形成，Browser proof异常路径修正与全套回归正在执行。
- [x] L84 C/S已形成；首轮A candidate需按七路径修正后重写；R未创建。
- [x] L85 Gate、Candidate、Activation、Capability、production和ISO状态不提升。

## Implementation Gate

- [x] I01 在A的两个Runner `M`中实现并测试唯一lifecycle接口、六方法sink和Browser proof状态机。
- [x] I02 两个controlled新增文件只调用该接口。
- [x] I03 形成parent=S、delta=`7=5 M+2 A`的clean A commit `db854055...`。
- [ ] I04 执行D01~D10A及D10B controlled正反例。
- [ ] I05 生成并复核A-stage patch SHA与controlled evidence。

当前结论：`SOURCE_IMPLEMENTED / VERIFIED / D10A_D10B_CONTROLLED_EVIDENCE_NOT_RUN`。

## Design Verification

- [x] `npm run contract:validate`通过：API-EDT generated DTO、OpenAPI、代表性Schema样例与contract case均有效。
- [x] 本任务20份关联Markdown共114个本地链接全部存在。
- [x] Design Checklist编号连续且恰为`L01~L85`。
- [x] 活动冲突扫描未发现“confirm后移除全部监听且仍拒绝新事件”的当前口径；历史复核记录保持只读。
- [x] `git diff --check -- specs docs`通过。
- [x] `/private/tmp/opm-canvas06-final-chain-a2`仍恰为两个Runner `M`加两个controlled `A`，未创建A commit。
- [x] 本轮未运行Runtime、Playwright、D10B或`194/388`；上述结果不构成实现或发布证据。
