# OPM、SQLite 与桌面选择性迁移验证

日期：2026-11-23。目标基线：`643fe9419940a513873befea31a92b020ec08fc6`。来源 HEAD：`5186a4516fdb014309aa941bb7cc27a4c14450b3`，包含未提交源码快照。本报告仅描述当前工作区的开发验证，不是 release、Candidate、Activation 或 ISO 符合性报告。未提交、未推送。

## 迁移结果

迁入 OPM 编辑器、OPD/OPL/Trace、画布交互及路由、配色与外观、图谱分析、脑图、文档附件、OPM 助手、可嵌入工作台和 Electron 桌面壳。保留建模目标与范围输入，不引入独立业务语义建模模式。混合入口以最后纯 OPM 提交 `8185afa` 为参照，再接入最新 OPM 增量。

存储只保留 SQLite：每项目数据库、全局配色目录库、事务与并发、草稿日志、修订及备份。未引入 PostgreSQL 实现或驱动、Nacos、Jenkins 内网配置、业务助手/语言/本体治理、来源凭证或用户数据库。业务 API 为拒绝路径，桌面网关不代理业务接口；负向测试检查这些边界。

来源报告、spec 和 checklist 中的完成状态仅作历史参考，不能继承为目标测试通过。Maven Wrapper、项目 README 定位和忽略策略独立保留。后续策略已写入[根 README](../../README.md)，`AGENTS.md` 仍不纳入版本库。

完整逐文件来源、原内容与结果 SHA-256、选择理由、适配类型和撤除项见 [文件清单](opm-selective-source-migration-20261123-files.json)。该 JSON 是源码迁移清单，不是发布 Manifest；它排除自身，避免循环摘要。

## 实际验证

环境为 macOS arm64、Node 24.22.3、Java 17.0.9；使用临时 SQLite、独立端口、占位供应商与模拟 SDK 服务，不读取真实数据库或调用用户模型账户。日志 SHA-256 与桌面 smoke 结果收录于[验证证据索引](opm-selective-source-migration-20261123-evidence.json)。

| 验证 | 实际结果 | 范围 |
| --- | --- | --- |
| Web Vitest | 809/809，84 文件 | 编辑器、store、组件、关系、布局、助手和保存 |
| Runtime Maven verify | 631/631，零跳过 | SQLite、OPM、OPL Golden、契约、API 与发布工具本地回归 |
| Recovery Tools Maven verify | 8/8，零跳过 | SQLite factory/materialization 与快照 |
| Fault packaged-JAR integration | 6/6 | 真实 JAR、资源 pin 与启动/拒绝路径 |
| 旧库转换 | 4/4，包含在 Runtime 631 内 | 真旧 V8 夹具、原 SHA 不变、新库、重复/未知/非法输入拒绝 |
| OPM 助手 Node 测试 | 142/142 | SDK 模拟、持久化、修订、审查与无业务端点 |
| 桌面 Node 测试 | 12/12 | 网关、资源、工作区、设置与进程边界 |
| Node 机器契约 | 70/70 | Draft/Workspace、Visual/E2E/Recovery Schema 正反例 |
| 统一 Playwright | 8/8，44.2 秒 | 回收站；图谱；空白平移；适应视图；中文改名；多选/撤销重做；脑图；属性/操作/状态移动及保存重开 |
| Typecheck、ESLint | 通过 | 当前 Web 全量 |
| Production Web、嵌入式组件构建 | 通过 | build 与 build:workbench，未执行发布 |
| OpenAPI 与生成 DTO 一致性 | 通过 | contract:validate，代表 Schema 与 API-EDT 正反例 |
| Electron 真实开发态 smoke | 通过 | 无 Key 建模、独立 Node 助手握手、中文空格路径、设置重开、停服备份、SQLite 恢复、保存重开和退出回收 |

Electron smoke 使用本仓库代码及开发资源，借用来源已安装的 Electron 可执行文件，没有修改来源安装或产生安装包。三次启动耗时为 `12512/5771/7789 ms`，属于本机开发测量，不能替代正式冷启动/性能门。图谱用例包含合成大图筛选，但不是冻结 Performance Report。8 个浏览器用例不等同于发布的 194/388 矩阵。

运行中发现并修复了 SQLite 工具快照适配、`/var` 与 `/private/var` 的真实路径包含性、同一 base fixture 幂等重开、Recovery projection digest，以及旧 E2E 对即时 layout command、主题颜色和新工具栏的过期假设；保留实际语义、边界和持久化断言。

## SQLite 兼容与使用

新活动基线为 SQLite `2.0`。旧 V1～V8 SQL 与 Java V6/V7 保留原 bytes；新版在 Flyway 前拒绝旧库直接升级。新增显式 `LegacySqliteImportCli`，只读原项目库，在暂存目录构建新库、核对字段/行数/外键/草稿链后原子发布。失败不发布最终目录，禁止覆盖、符号链接和未知/业务表。

当前转换器一次只支持一个旧项目到一个不存在的新根，不合并已有工作区，也不会替用户执行迁移。先停服备份，按 [SQLite 升级说明](../integration/sqlite-storage-upgrade.md)转换及复核，旧程序只能配合未修改旧目录回退。助手会话与 Profile 资产仍需共同备份。

Recovery/E2E 保留真实 `.db`、SQLite 事务故障位置与完整性检查。Attempt Schema 内嵌资源 pin 更新为 `61440` bytes / `fd063b1fbe2531bbf5832c27177476e2bf5e0449469ac0a11c29e83350afe36e`，JAR 缺失/篡改资源的拒绝测试保留。旧 source-chain、raw refs 和历史 release 报告不能用于新源码；正式发布需基于新的 clean commit 重建完整链。

## 扫描与剩余限制

敏感信息核查只输出路径与计数，不记录密钥原文。使用来源实际凭证值比对迁移文件，并扫描常见 token、私钥模式及禁止路径；最终结果见文件清单。压缩 Skill 仅包含 OPM 指导及规则资源。忽略目录中的 `.runtime`、`node_modules`、本地 lock、测试数据与构建输出不进入清单。

初次快照与收尾之间，来源有 6 个路径的摘要变化，清单记录原快照与收尾摘要，不将其解释为本仓库的写入证明。变化涉及未迁入的混合存储规格、双存储工具及其 PG 专用测试/回放调整；本轮保留经完整 SQLite 验证的分支，不追加 PG gate/skip。来源目录没有作为本轮的写入目标。

安装时 npm 报告 `98` 项依赖漏洞：`88 moderate / 9 high / 1 critical`；未自动执行可能破坏来源兼容性的 `audit fix --force`，需另行按依赖链评估升级。Web 主 chunk 为 `574.82 kB`，仍有 Vite 大 chunk 提示及已有 bootstrap 非 module 提示，不能称构建零告警。仓库按用户现行策略不跟踪 lock，因此新安装的传递依赖需重新验证。

未执行真实 DeepSeek 远端多轮验收、全发布矩阵、Windows/macOS Intel/最低系统安装、签名、公证或安装包构建。本轮未生成 Candidate、Activation、Capability 启用或标准符合性证据。开发验证通过不解除上述发布门。

本轮 `17881/5186` 隔离服务已停止。已删除日志精确记录的本轮大型 Golden 回放临时目录（可重建夹具）；测试日志、结果索引与开发 `.runtime` 保留，不删除用户数据或其他服务。
