# Checklist: DEV-CANVAS-06 Common Visual Adapter 受控 Java/Profile 输入闭包 Bugfix

状态：`DESIGN_FROZEN / ADAPTER_TEST_INPUT_BUILDER_PRESENT_NOT_ACCEPTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 问题、Root Cause、版本 | 1~3 | C01~C08 |
| 修改边界 | 3.1 | C42~C43 |
| Java输入 | 4.1 | C09~C18 |
| Profile输入 | 4.2 | C19~C31 |
| 跨进程join与首错 | 5~6 | C32~C41 |
| 实现边界、验收、回滚 | 7~8 | C42~C48 |

## Design Checklist

- [x] C01 已复现Adapter Request `0.1`没有Java executable输入。
- [x] C02 已复现Adapter Request `0.1`没有Profile受控root/ref/tree输入。
- [x] C03 Runtime JAR ref不等于Java executable identity。
- [x] C04 active binding不等于Profile文件identity。
- [x] C05 历史Request `0.1`保持只读。
- [x] C06 活动Request升级为`0.2/0.2.0`。
- [x] C07 新字段全部必填，禁止optional fallback。
- [x] C08 历史`0.1`不得进入production adapter。
- [x] C09 Java major固定21。
- [x] C10 Java ref固定kind/path/length/SHA。
- [x] C11 Java path固定absolute normalized realpath与`/bin/java`。
- [x] C12 Java必须regular、non-link、executable。
- [x] C13 Node复算raw length/SHA。
- [x] C14 Node以exact path和`shell=false`执行`-version`。
- [x] C15 版本输出必须唯一解析为major 21。
- [x] C16 禁止PATH/父JAVA_HOME/env/current Java替代；Builder只可从exact Java推导JDK root并显式注入Planner受控env。
- [x] C17 Base/Clone/Web命令首token必须等于Request path。
- [x] C18 Java与Runtime JAR身份不得互换。
- [x] C19 Profile asset root固定absolute normalized realpath。
- [x] C20 Profile tree逻辑root固定`profile/assets`。
- [x] C21 五类refs及UTF-8 path顺序已冻结。
- [x] C22 五个逻辑path前缀与profile.json位置已冻结。
- [x] C23 逻辑path到物理root的唯一映射已冻结。
- [x] C24 root inventory恰五个普通非链接文件。
- [x] C25 禁止额外/缺失/重复/链接/特殊/临时文件。
- [x] C26 五项raw length/SHA必须逐byte复算。
- [x] C27 tree byte length与JCS digest公式已冻结。
- [x] C28 Profile manifest四依赖join已冻结。
- [x] C29 package digest与active binding join已冻结。
- [x] C30 direct-root ProfilePackageAssembler为唯一loader。
- [x] C31 禁止checkout/env/目录扫描/fallback。
- [x] C32 Node preflight发生在base/clone/Runtime前。
- [x] C33 Web asset root逐字符等于Request root。
- [x] C34 Runtime Ready五refs逐字段等于Request。
- [x] C35 Runtime Ready tree SHA等于Request tree SHA。
- [x] C36 Java Ready writer必须从实际bytes独立复算。
- [x] C37 144 attempt只读复用同一Java/Profile identity。
- [x] C38 每个attempt进程/storage/nonce/Ready仍隔离。
- [x] C39 Java/Profile首错顺序已冻结。
- [x] C40 输入失败固定`GOLDEN_COMMON_ADAPTER_INPUT_INVALID/2`。
- [x] C41 输入失败零base/clone/Runtime/callback/result。
- [x] C42 Node owner仍收敛在既有adapter文件与测试。
- [x] C43 不修改公共API、SQLite DDL、Vue或production配置。
- [x] C44 Schema正反例矩阵已冻结。
- [x] C45 Java与Profile单变量篡改矩阵已冻结。
- [x] C46 144串行与关闭矩阵只能在preflight后运行。
- [x] C47 回滚不得恢复fallback或optional字段。
- [x] C48 事实、假设与非结论已分离。
- [x] C49 完整测试Request不得手写，唯一由Adapter Test Input Bundle Builder生成。
- [x] C50 Request Runtime source kind固定`LOCAL_RUNTIME_JAR`并与Handoff/Plan逐字段相等，staged/Ready保持独立`RUNTIME_JAR`身份。

## Validation

- [x] Adapter Request `0.2`通过Draft 2020-12 strict编译和受控正反例。
- [x] 03C主设计、实现规格/checklist和Clone/Web协议同步完成。
- [x] 测试策略、执行包、冻结基线、契约索引和README同步完成。
- [x] Markdown本地链接与`git diff --check`通过。

## 当前门状态

- Adapter Request受控输入设计：`FROZEN_FOR_IMPLEMENTATION`。
- Adapter Test Input Builder/Verifier：`IMPLEMENTATION_PRESENT_NOT_ACCEPTED`。
- Node adapter：`BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION`。
- Java Base/Clone/Web局部实现：不因本设计升级为完整03C通过。
- 144调度/关闭矩阵：`NOT_RUN`。
- Candidate/Gate/Capability/production/ISO：不提升。
