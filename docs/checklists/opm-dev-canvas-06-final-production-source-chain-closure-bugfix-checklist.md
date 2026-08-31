# Checklist: DEV-CANVAS-06 Final Production Source Chain Closure Bugfix

状态：`DESIGN_FROZEN / C_S_A_R0_R_R2_CREATED / R2_PRODUCTION_REBUILD_PENDING`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、复现、Root Cause | 1~2 | F01~F08 |
| Fix Strategy与origin intake | 3~4 | F09~F20 |
| 五节点chain与stage allowlist | 5~10 | F21~F39 |
| Git/patch校验与双target | 11 | F40~F49 |
| 重建、六方join、取代关系 | 12~13 | F50~F59 |
| 验收、边界、回滚 | 14~17 | F60~F72 |

## Design Closure

- [x] F01 `9048bb3...`与`0dcaa27...`同parent且互为sibling的冲突已复现。
- [x] F02 旧Fault链不是`9048bb3...`后继，不能通过祖先关系闭合。
- [x] F03 旧17项final限制与后继Fault/Runner source bytes不可同时满足。
- [x] F04 Manifest/HEAD/Runner/Report必须逐字符同commit，不能用语义相等替代。
- [x] F05 Root Cause定位为局部source闭包缺少联合Git图，且Runner owner修改权错误地只归Stage R。
- [x] F06 为什么此前未发现已记录：首次闭包未沿controlled spec到Runner owner调用关系复核A权限。
- [x] F07 本任务仅修source identity，不修改Runner/Fault产品语义。
- [x] F08 真实`194/388`继续阻断。
- [x] F09 origin完整固定为`9048bb355aff18d5c00fbbaeb1660b979f4e6daa`。
- [x] F10 origin parent/tree/epoch/patch SHA已实算记录。
- [x] F11 origin既有delta固定为`17=14 M+3 A`，仅作为origin intake。
- [x] F12 origin external Manifest已核实为`0.2/0.2.0`、194 case、388 attempt调度。
- [x] F13 origin Manifest raw length/SHA已记录。
- [x] F14 origin Manifest只表示输入生成，不表示case执行。
- [x] F15 Runner final形成后禁止复用origin Manifest/Runtime/Web/Common。
- [x] F16 36项Fault baseline已从新origin逐项复算。
- [x] F17 36项集合摘要保持`69491a...b411e`，结论来自新实算。
- [x] F18 baseline任一漂移必须新开bugfix。
- [x] F19 旧Fault commit保留只读历史。
- [x] F20 设计未预填未来R SHA；C=`f4c978e...`、S=`2f698cf...`、A=`db85405...`已形成，R未创建。
- [x] F21 五节点`O -> C -> S -> A -> R`角色和single-parent顺序已冻结。
- [x] F22 Stage C固定为`20=12 M+8 A`。
- [x] F23 Stage C旧contract 12项逐路径冻结。
- [x] F24 Stage C External Store source-chain owner 8项逐路径冻结。
- [x] F25 新contract patch SHA必须实际重算，不沿用历史值。
- [x] F26 Stage S固定为exact `2 M`。
- [x] F27 Stage S raw输入相同时patch SHA必须等于`56138e19...`。
- [x] F28 Stage A经后继修正固定为exact `7=5 M+2 A`，两个Runner、release discovery、两个unified source guard与两个controlled新增路径逐项冻结。
- [x] F29 Preflight Report `0.2`字段保持不变，origin/contract/candidate分别映射O/S/A。
- [x] F30 D01固定从A向上复算S/C/O，`implementation_delta`恰为四项`M/M/A/A`。
- [x] F31 Stage R经Common编排实现规格第3.1节收敛为exact `63=52 M+11 A`：非文档`50=43 M+7 A`与文档`13=9 M+4 A`。
- [x] F32 Stage R的完整allowlist唯一归属Common编排实现规格第3.1节；覆盖package/runner/stage/report、API/Runtime、Snapshot/Projection、Context/Setup、四Driver、production bridge、前端selector与定向测试。
- [x] F33 Runner Source Set继续为`0.2/24`，但不得以其24项entry替代Stage R的63项Git allowlist。
- [x] F34 Stage R不足时必须先新增bugfix扩allowlist。
- [x] F35 累计O..R经实际diff复算为`83=62 M+21 A`。
- [x] F36 累计数组唯一由C/S/A三段allowlist与Common编排规格第3.1节的R数组组合并按Git diff去重；历史52项副本已废止。
- [x] F37 Stage S、package及A/R两个Runner owner的重叠计数规则明确，禁止简单相加。
- [x] F38 rename/copy/extra/missing/status drift均拒绝。
- [x] F39 Manifest/Report/Attempt Schema版本不升级；Runner Source Set升级为`0.2/0.2.0/24`。
- [x] F40 Git读取固定禁用replace并要求完整对象。
- [x] F41 禁止branch/tag/abbrev/message/mtime/latest/fallback。
- [x] F42 `FAULT_2A` target固定HEAD=A及`25=15 M+10 A`累计delta。
- [x] F43 `FINAL_RUNNER` target固定HEAD=R及`83=62 M+21 A`累计delta。
- [x] F44 CLI必须显式传入全部stage commit，禁止环境补齐。
- [x] F45 每个stage patch SHA算法固定为raw`git show`stdout。
- [x] F46 final source patch SHA算法固定为raw`git diff O R`stdout。
- [x] F47 commit/tree/file集合摘要不得替代patch SHA。
- [x] F48 source porcelain必须为空。
- [x] F49 merge/shallow/graft/replace均拒绝。
- [x] F50 2A controlled Manifest与evidence只绑定A。
- [x] F51 最终Handoff/Intake/Runtime/Web/Common/Manifest/Report只绑定R。
- [x] F52 最终生产重建顺序已冻结。
- [x] F53 六方source join统一为R。
- [x] F54 Runner Source Set活动口径为24项raw aggregate，不等于Git SHA。
- [x] F55 External Store旧final-direct-parent=e598限制已被取代。
- [x] F56 e598->9048的17项结论保留为历史origin intake。
- [x] F57 0dcaa/63851f8/586d6de活动chain决定已被取代。
- [x] F58 Fault产品语义、36项字段表、两个新增路径和D10语义未被取代；两个Runner ref在A允许修改。
- [x] F59 旧checklist READY不能绕过新stage接纳。
- [x] F60 正例矩阵覆盖origin、四段chain、A的`2 M+2 A`、A/R受控回归、双target、patch与六方join。
- [x] F61 反例矩阵覆盖旧链、错误parent、target互用、A缺Runner owner、复制Runner语义和delta drift。
- [x] F62 反例覆盖origin资产复用、patch算法替代和dirty source。
- [x] F63 反例覆盖未完成388 attempts却生成READY Report。
- [x] F64 本设计任务修改边界只允许文档。
- [x] F65 本轮未修改Java/Node/Vue/Schema/package/release资产。
- [x] F66 后继Build严格受stage allowlist约束。
- [x] F67 回滚状态固定为`BLOCKED_BY_CROSS_CHAIN_SOURCE_IDENTITY_CONFLICT`。
- [x] F68 不提升Gate、Candidate、Activation或Capability。
- [x] F69 不形成production或ISO符合性证明。
- [x] F70 事实与未来结果明确分离。
- [x] F71 未来commit、patch与artifact SHA禁止占位。
- [x] F72 当前设计已冻结，后继实现仍未开始。
- [x] F73 Stage A唯一lifecycle接口固定为`runControlledLifecycleSession()`。
- [x] F74 lifecycle接口四个参数及session级返回值已由后继规格冻结。
- [x] F75 `prepareControlledAttempt()`只允许lifecycle接口内部调用。
- [x] F76 spec的12个预绑定handler只接收origin与observation sink。
- [x] F77 observation/precondition client factory唯一归lifecycle接口。
- [x] F78 Runtime/Web READY、INITIAL/REOPEN、child终止和cleanup唯一归lifecycle接口。
- [x] F79 D10B三类采样和Artifact writer唯一归lifecycle接口；spec逐cycle在route/navigation/API前attach真实Page并在finally关闭fresh Browser树后以相同对象confirm，Runner在临时confirm后保持迟到事件sentinel到handler settle/sink关闭，复核零迟到事件并移除全部sentinel形成最终proof后才允许DURING；接口回收Runtime/Web并按12个唯一端口去重计数。
- [x] F80 lifecycle接口实现与测试完成前禁止创建A commit。
- [x] F81 Stage R前四项固定同步OpenAPI ErrorDetail、19项Service映射、Schema正反例和实际HTTP raw-body证据。
- [x] F82 API/Runtime contract子切片失败时禁止继续Family Driver/Runner或形成R。
- [x] F83 `LocalApiService.java`不加入Runner Source Set，必须由同一R重建Runtime JAR闭合。
- [x] F84 未列领域错误保持原码，禁止批量替换`domain()`。
- [x] F85 Family Controlled Invocation Context `0.1`、388项schedule和唯一producer/verifier已冻结。
- [x] F86 production bridge进入Source Set第20项，四Driver顺延至21~24。
- [x] F87 Runner按`driver_id` exact dispatch并构造Family/Common CaseExecution及五参数调用对象。
- [x] F88 precondition client一次性、attached Page同源fetch与API Exchange证据边界已冻结。

## Implementation Acceptance

- [x] I01 新C=`f4c978e...`形成，parent=O且delta=`20=12 M+8 A`。
- [x] I02 新S=`2f698cf...`形成，parent=C且delta=`2 M`。
- [x] I03 lifecycle接口、六方法sink、`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED` Browser proof、release discovery、source guard及Runner测试通过后，新A=`db854055...`形成，parent=S且delta=`7=5 M+2 A`，controlled新增文件只调用`runControlledLifecycleSession()`。
- [ ] I04 `FAULT_2A` target、controlled Manifest和D10B evidence通过。
- [x] I05 R0=`144e74bfa64dfb79bcea5ce572034768e4b3b016`形成后，以R=`4b30d269c100e655e8c75060a96bcb2ae11e4aa0`完成delta-owner闭合；链为A->R0=`63=52 M+11 A`、R0->R=`2 M`，Node 22定向验证通过。
- [x] I06 O..R累计delta实算为`83=62 M+21 A`。
- [x] I07 C/S/A/R stage patch SHA和final source patch SHA已记录并复算；R tree=`c46fd781dd81ce82945d8a96b5b5d6aa1f2919bd`、epoch=`1788163222`、stage patch=`5a3e0dde...a88f`、final patch=`b690f151...5161`。
- [x] I08 从最终R重建fresh external Handoff/Intake/Runtime/Web/Common：外置版本根`clean-4b30d269c100`，installed Unified Verifier tree SHA=`7f137875c4e613fb70f824d1527850e86c7812b34378ba1253dfc4fcc5de96f9`。
- [x] I09 从最终R生成Manifest并通过staging/installed verifier：`dev-canvas-06.e2e.4b30d269c100.0bba586bdcbf`，Manifest SHA=`6692e32d4326524ecff902fc86d78eb86222af5a952499f5641b826b6611989c`，transaction tree SHA=`34c6f1934cfcec0b9c72e5fe9f3e330236496196f15964b6689a7044523d0e76`。
- [x] I10 R2=`6918ee26153f880802ebadbc8fc01407e4f5b906`以R为唯一parent形成CLI闭包；R2 patch=`75cfb71f948be97805297e4abd90d9dd176585ab71748c5a55cea9190da688e6`，delta恰为`9 M`。production preflight 复现累计集合实际为`85=64 M+21 A`、历史常量为 83 项，已由 R3 修正规格取代，R2 不可消费。
- [ ] I09A Runner Source Set `0.2/24`、8 changed/new与16 unchanged及Report aggregate闭合。
- [ ] I10 真实194/388完成并生成可验证Report。
- [ ] I11 六方source commit逐字符等于R。
- [ ] I12 GATE-06-03仅按真实Report与完整证据判断。

## 当前门状态

- Source-chain设计：`FROZEN_FOR_IMPLEMENTATION`。
- C/S/A/R0/R/R2/R3/R4：`CREATED/CLEAN/SOURCE_VERIFIED`；R2/R3 均为历史输入，R4=`a763587...` 是唯一 production final source。新 clean R4 Manifest 重建待执行。
- 2A controlled execution：`NOT_RUN_ON_NEW_CHAIN`。
- origin Manifest：`ORIGIN_BUILD_VERIFIED/NOT_FINAL_PRODUCTION_INPUT`。
- production `194/388`：`NOT_RUN`。
- E2E Report、Gate、Candidate、Activation、Capability、production、ISO：不提升。
