# Checklist: DEV-CANVAS-06 Common Visual Adapter 受控测试输入 Builder 闭包 Bugfix

状态：`DESIGN_FROZEN / IMPLEMENTATION_PRESENT_NOT_ACCEPTED / 8_BASE_144_CLONE_NOT_RUN`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、Root Cause、Fix Strategy | 1~3 | C01~C09 |
| 修改与禁止边界 | 4、11 | C10~C13、C47~C49 |
| CLI与布局 | 5~6 | C14~C20 |
| Profile/Common/Plan/Request输入 | 7 | C21~C34 |
| Observed与callback | 8 | C35~C41 |
| Bundle、事务、错误 | 9~10 | C42~C46 |
| 验收、回滚、事实 | 12~13 | C50~C58 |

## Plan

- [x] 核查现有02B Builder/Verifier、Profile closure reader、Planner、Request/Observed Schema和03C测试。
- [x] 确认不存在同时闭合五类输入的Adapter测试Builder。
- [x] 冻结Bundle Schema、CLI、原子root、exact join、fixed callback和后继allowlist。
- [x] 同步03C、Visual Common、测试、执行包、release与索引边界。
- [x] 执行Schema、契约、链接和差异验证，不执行8/144。

## Design Checklist

- [x] C01 不新增72-only Capture Plan。
- [x] C02 活动Plan仍为`0.1/0.1.0`和1242项。
- [x] C03 72个Common capture必须来自本轮fresh Common root。
- [x] C04 不允许历史Plan或手工部分Request。
- [x] C05 不允许`{}`或不完整Profile五文件。
- [x] C06 不允许部分Observed Result或运行时反填。
- [x] C07 新增唯一Bundle `0.1`入口。
- [x] C08 Builder与Verifier职责分离。
- [x] C09 READY只表示可进入Adapter受控测试。
- [x] C10 本设计只改设计、Schema和索引。
- [x] C11 公共API、SQLite DDL、业务资产和production配置只读。
- [x] C12 后继实现delta固定`19=8 M+11 A`。
- [x] C13 未列产品缺陷必须新开bugfix规格。
- [x] C14 Builder CLI八项输入已冻结。
- [x] C15 Verifier installed/staging两模式已冻结。
- [x] C16 env/stdin/URL/glob/scan/latest/fallback全部禁止；Planner仅接收由exact Java推导的固定五键子进程env。
- [x] C17 的历史340文件口径已由44-file inventory闭包取代；活动final布局固定341个普通单链接文件。
- [x] C18 Profile、Common、Plan、Request、callback固定路径已冻结。
- [x] C19 work root固定为final sibling且成功时不存在。
- [x] C20 final/work/staging必须fresh且物理隔离。
- [x] C21 source clean HEAD与Handoff source commit exact join。
- [x] C22 Intake/Handoff/Runtime raw ref exact join。
- [x] C23 Java absolute realpath/raw/major 21复用Request契约。
- [x] C24 Runtime source ref固定`LOCAL_RUNTIME_JAR`并与Handoff/Plan逐字段相等；staged/Ready ref保持`RUNTIME_JAR`且只按raw identity闭合。
- [x] C25 Profile五个source固定路径和target映射已冻结。
- [x] C26 Profile tree固定使用`root_path=profile/assets`。
- [x] C27 Profile inventory/raw/tree/package/binding全部复算。
- [x] C28 Common必须调用现有02B Builder并再次只读验证。
- [x] C29 的历史43项口径已由44-file inventory闭包取代；活动Common root固定44项及Catalog`0.2.0`，包括Common Setup Plan。
- [x] C30 Common tree digest复用44项JCS公式，包含Common Setup Plan。
- [x] C31 Planner外置Common root参数和成对约束已冻结。
- [x] C32 legacy Planner只要求除自引用source SHA外语义一致。
- [x] C33 Plan固定1242/1170/72和Common exact join。
- [x] C34 Request五个绝对路径、raw refs和epoch映射已冻结。
- [x] C35 callback descriptor固定144项和四字段唯一key。
- [x] C36 descriptor顺序固定ordinal后attempt 1/2。
- [x] C37 Observed全部必填字段来源已冻结。
- [x] C38 geometry test digest preimage已冻结。
- [x] C39 PNG必须真实可解析且IHDR/ref与Observed闭合。
- [x] C40 fixed callback只能descriptor exact lookup。
- [x] C41 callback禁止扫描、补字段、推导或反填。
- [x] C42 Bundle payload摘要排除自身字段后使用共享JCS。
- [x] C43 Schema结构验证与semantic verifier职责已分开。
- [x] C44 staging到final路径映射只允许四个Request读取路径。
- [x] C45 installed verifier禁止任何映射或fallback。
- [x] C46 staging/fsync/rename/installed/quarantine事务和三类错误已冻结。
- [x] C47 Planner两项M和Builder/Verifier/test三项A已列出。
- [x] C48 原14项Adapter/Fault实现范围保持不变。
- [x] C49 新三文件不得进入production evidence identity。
- [x] C50 strict Schema完整正例要求已冻结。
- [x] C51 Profile负例矩阵已冻结。
- [x] C52 Common/Plan负例矩阵已冻结。
- [x] C53 Request/callback负例矩阵已冻结。
- [x] C54 原子事务故障矩阵已冻结。
- [x] C55 8/144只在Builder/Verifier实现验收后执行。
- [x] C56 回滚不得恢复历史输入或放宽Verifier。
- [x] C57 事实与假设已分离。
- [x] C58 Gate/Candidate/Capability/production/ISO状态不提升。
- [x] C59 exact Java父两级推导JDK root/bin/jar及Planner五键env已由后继修正规格冻结。
- [ ] C60 现有Builder/Verifier实现修正Runtime kind、derived JDK和Planner env后重新完成验收。

## Validation

- [x] Bundle Schema通过Draft 2020-12 strict编译。
- [x] Bundle Schema受控完整正例通过，缺字段/多字段/错误基数负例拒绝。
- [x] `npm run contract:validate`通过。
- [x] 本轮目标Markdown本地链接检查通过。
- [x] `git diff --check`通过。
- [x] 本轮无需Maven/Playwright/8/144：没有修改或执行实现。

## 当前门状态

- Adapter测试输入设计：`FROZEN_FOR_IMPLEMENTATION`。
- Adapter测试输入Builder/Verifier：`IMPLEMENTATION_PRESENT_NOT_ACCEPTED`。
- Node adapter：`BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION`。
- `8 base/144 clone`：`NOT_RUN`。
- 03B、GATE-06-03、Candidate、Activation、Capability、production、ISO：不提升。
