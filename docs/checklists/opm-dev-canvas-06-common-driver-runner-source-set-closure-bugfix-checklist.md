# Checklist: DEV-CANVAS-06 Common Driver编排与Runner Source Set闭包修正

状态：`FROZEN/COMPLETE`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 背景、复现、Root Cause | 1、2 | C01~C04 |
| Fix Strategy、非目标 | 3 | C05~C10 |
| 精确allowlist、Source Set | 4 | C11~C16 |
| owner与修改边界 | 5、6 | C17~C22 |
| 验收、验证、回滚 | 7、8 | C23~C30 |
| 事实与后继输入 | 9 | C31~C34 |

## Checklist

- [x] C01 已复现独立production编排文件不在23项Source Set的问题。
- [x] C02 已确认`ALL_PATHS_NOT_IN_ENTRIES`会排除该文件。
- [x] C03 Root Cause定位为实现allowlist未反向闭合机器source identity。
- [x] C04 未把局部代码存在或测试状态当成Report/Gate证据。
- [x] C05 唯一Fix Strategy为编排收敛到`release-canvas06-e2e-run.mjs`。
- [x] C06 不升级Runner Source Set `0.1/0.1.0`。
- [x] C07 不升级Report `0.2`或`runner_version=0.2.0`。
- [x] C08 不新增独立controlled orchestration production helper或CLI。
- [x] C09 Common Driver、UI selector、Fact删除、store和factory只读。
- [x] C10 Schema、OpenAPI、SQLite、Profile与release资产只读。
- [x] C11 后继实现allowlist冻结为`8=7 M+1 A`。
- [x] C12 七个`M`路径在当前tracked set中存在。
- [x] C13 一个`A`路径在当前tracked set中不存在。
- [x] C14 四个production路径均属于Source Set 23项。
- [x] C15 四个测试路径明确属于Source Set排除集。
- [x] C16 source aggregate继续按既有raw ref/JCS公式计算。
- [x] C17 `prepareControlledAttempt()`唯一owner已冻结。
- [x] C18 Manifest/Profile/driver raw join owner已冻结。
- [x] C19 Attempt artifact owner已冻结。
- [x] C20 production Playwright配置owner已冻结。
- [x] C21 controlled browser spec禁止复制Common常量。
- [x] C22 本修正文档allowlist恰为12份。
- [x] C23 Common主设计升版并同步owner。
- [x] C24 原Common规格/checklist移除18路径和重复实现要求。
- [x] C25 Runner规格/checklist同步Source Set内owner边界。
- [x] C26 Toolchain checklist同步Report身份边界。
- [x] C27 README、测试策略、执行包和冻结基线同步。
- [x] C28 活动文档无独立编排文件实现要求。
- [x] C29 Markdown链接和版本引用闭合。
- [x] C30 `git diff --check`通过。
- [x] C31 事实与假设已分栏。
- [x] C32 exact clean base已由集成Source后继固定为`e598b305...`；8项不得独立提交。
- [x] C33 真实controlled 194/388、Report与Gate保持未运行。
- [x] C34 Candidate、Activation、Capability、production和ISO状态未提升。

## 当前门状态

- 设计修正：`COMPLETE`。
- Common编排Build：`EMBEDDED_IN_17_PATH_INTEGRATED_SOURCE/NOT_STARTED`。
- controlled `194/388`：`NOT_RUN`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。

## 验证记录

- `PASS`：无依赖JSON解析确认Source Set为`0.1/0.1.0`、23项唯一，四个production路径位于第1/3/8/19项。
- `PASS`：实现规格allowlist解析为`8=7 M+1 A`，七个`M`均已跟踪，唯一`A`当前不存在。
- `PASS`：12份同步文档的本地Markdown链接均可解析。
- `PASS`：`git diff --check`。
- `NOT_RUN/DEPENDENCY_MISSING`：既有Schema定向测试在Node `22.22.0`加载前因本地未安装`ajv`返回`ERR_MODULE_NOT_FOUND`；未将其记为测试通过。该测试未运行不改变本轮未修改Schema且已直接解析机器契约的事实，后继Build安装锁定依赖后必须重跑。
- `SUPERSEDED_AS_STANDALONE_SOURCE_PACKAGE`：本checklist只证明8项职责与Source Set闭包，不再授权独立source commit；commit与production source join由17路径集成Source checklist承接。
