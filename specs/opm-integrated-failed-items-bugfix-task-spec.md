# 合并后未通过项修复

日期：2026-10-05～2026-10-06。Work Mode：change；Risk Level：L3；Task Type：bugfix；Active Playbooks：backend-springboot（primary）、testing。

## Spec

目标：修复最新本地程序合并报告中的五项 Java 失败及 workbench-inline-name 浏览器失败，完整重跑相关验证，保持真实密钥不入库。

允许：相关 Runtime/Fault verifier 及测试、对应前端画布/交互与测试、Fault Launcher 实现规格、后继修正规格、本文及合并报告。禁止：用户数据、来源目录、.env.local、API/Schema 结构、数据库迁移、依赖变更、完整规则覆盖声明、生产 Gate/Candidate/Activation、.harness、无关重构和提交推送。保留上轮全部 383 文件 dirty/untracked 合并成果。

复现：Java 21 + Maven Wrapper 执行四类定向测试 33 项，2 failure、3 error；日志 /private/tmp/opm-failed-items-baseline-20261005.log。NewDraftModelTest 预期 7，实际 V8 为 8；两个基线用例违反 specs/opm-validation-task-persistence-bugfix-task-spec.md 与 API 设计第 7.9 节的 INCOMPLETE 禁止创建基线规定；Fault verifier 旧固定 raw SHA 为 350829...916b4，当前资源为 61432 bytes / d8c34923a1342cdffd5eb4e22ddf328969bf3c1f6b6804e7acebb56dd51891d8。前轮真实浏览器旧中文改名测试在中心拖线阶段失败，边缘拖线和改名主路径通过，需进一步区分产品手势与测试时序根因。

契约决定：保留有限规则 coverage_state=INCOMPLETE、VALIDATION_BLOCKED 和完整证据门。旧测试必须对齐拒绝行为；已存在基线的只读测试用独立 SQLite 历史夹具，不调用部分覆盖任务伪造新基线。迁移断言同步 V8，并检查新增表可用。Fault Schema 结构不改，升级现行实现规格并同步固定摘要到当前冻结资源；仍只校验 JAR 内嵌 bytes，禁止 checkout fallback 或删除身份校验。历史 controlled source 输入表保留原 commit 的原指纹，只加当前源码后继说明；更新常量不代表原发布证据有效。

验收：

- FI-01：五项 Java 原失败复现路径通过；V8 表/版本验证明确，基线拒绝部分覆盖且保持零写入，历史基线仍只读。
- FI-02：Fault Plan 三正例、字段拒绝、raw drift 均通过；新增当前 raw pin/资源一致性回归，篡改资源仍拒绝。
- FI-03：原 workbench-inline-name E2E 完整通过（关系、中文改名、空白/Enter/Escape、OPL、保存和重开）；按实证修复，不通过改为边缘手势跳过中心问题。
- FI-04：后端全量、前端相关与静态/构建、隔离浏览器回归执行并记录；扫描真实密钥零匹配，无用户服务/数据操作。

验证：先定向 red/green，随后全量 Java、前端/助手和相关 Playwright。Runtime 与前端使用独立端口、独立数据，JAR 以稳定副本运行。没有真实 DeepSeek 或生产发布验证。构建非 module 提示并非测试失败，不混入本次公共启动机制修改。

回滚：只撤销本轮相对于已合并工作树的修改，不恢复到旧 Git HEAD 丢掉合并成果；不降级数据库，不删除用户资料。若回退 verifier 固定摘要，必须连同规格和对应资源身份一起核对，禁止以移除校验方式恢复。

## Plan

1. 核对部分覆盖门禁、当前 Schema 身份和中心拖线真实事件；固定原失败证据。
2. 修正旧测试契约期待，补充 V8/历史基线回归，同步冻结 raw pin 与拒绝验证。
3. 定位并修复浏览器手势或测试时序根因，完整重跑原中文改名用例。
4. 扩大回归并更新报告及完整改动清单，保留历史失败事实及后续修复结果。

已确认浏览器根因：默认 1280×720 下画布 frame 底部约为 y=479，新建节点中心 y=512；elementsFromPoint 和实际鼠标事件均命中 bottom-panel，未命中 X6 节点。桌面改名用例明确使用 1600×1000，保留中心拖线，不改变产品默认视口或手动平移状态。原用例完整通过，四屏宽脑图及窄屏平移由独立用例回归。

TaskDescriptor 不包含 result；基线回归从隔离 SQLite 的 background_task.result_json 按 task_id 读取真实摘要和 evidence_summary_token，并断言拒绝后 baseline 表为零条。历史基线只读测试使用独立夹具，未放宽生产门禁。

## Checklist

引用：本文 FI-01～FI-04。

- [x] 边界确认：用户授权修复所有未通过项；禁止放宽基线门或去掉 raw 身份校验；来源只读、密钥不复制。
- [x] FI-01：原失败路径已绿；全量 558/558；最终零写入断言定向 27/27。
- [x] FI-02：Fault verifier 5/5；打包 JAR 集成 6/6，包含真实资源篡改拒绝；固定 raw pin 一致。
- [x] FI-03：原中文改名用例完整通过；相关浏览器 6/6，保留中心拖线。
- [x] FI-04：前端 417/417、助手 49/49、草稿契约 26/26、typecheck/lint/build 通过；真实密钥零命中，隔离服务验收后关闭。

实际证据、命令及本轮完整修改清单见[合并报告的修复复验记录](../docs/reports/opm-latest-local-source-integration-report.md#修复复验2026-10-06)。既有 bootstrap 非 module 提示、真实供应商及正式发布验证不属于本次通过范围。
