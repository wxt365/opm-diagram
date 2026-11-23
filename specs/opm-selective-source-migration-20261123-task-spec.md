# OPM 与 SQLite、桌面端选择性迁移

日期：2026-11-23。Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot（primary）、db-migration、testing。

## 目标与边界

来源为 `/Users/xiaotaowang/01code/41jdp/03opm/opm-diagram` 的当前源码快照，含未提交的 OPM 修复；目标起点为 `643fe9419940a513873befea31a92b020ec08fc6`。迁移 OPM 核心、OPD/OPL、图谱分析、脑图、OPM 助手、共享交互以及 Electron 桌面客户端。用户已确认数据库只保留 SQLite，不引入 PostgreSQL、Nacos、Jenkins 内网部署配置。来源只读，不导入 Git 历史，不提交或推送。

允许：apps/web、apps/assistant、apps/desktop 的 OPM 实现与必要共享组件；Runtime/恢复工具的 OPM 与 SQLite 代码；相应契约、资源、测试、依赖配置、README、迁移说明及报告。按依赖需要更新公共 OPM API、版本化保存格式、SQLite 存储及桌面依赖。保留目标 Maven Wrapper、README 项目定位、忽略策略和既有安全修复。

禁止：业务语义建模及其语言、业务助手/本体生成/治理模块、业务专用布局包和迁移；PostgreSQL 实现/驱动/部署配置；来源 .env、本地密钥、用户数据库、安装包、缓存、node_modules、target、.harness 和 AGENTS.md。共享代码去除上述接入口，不以禁用按钮替代模块排除。

新 SQLite 基线与原 V1～V8 不同，不将原文件交给新 Flyway 基线直接迁移，不覆写旧迁移。旧数据必须通过显式、离线、保留原库的转换或导入路径验证；不对用户真实存储执行升级。已完成的来源测试报告只作为历史资料，不作为目标验证通过。正式发布 Gate、Candidate、Activation、签名和 ISO 状态不提升。

## 验收

- M01：文件清单记录来源身份、每项来源/目标摘要和选择理由；业务建模、PostgreSQL、Nacos 与 Jenkins 内网配置不进入迁移结果或运行依赖。混合实现允许提取 OPM/SQLite 分支后迁入，保留来源摘要与适配标记。
- M02：OPM 编辑、关系、子图、OPL/Trace、颜色/外观、路由、图谱分析、撤销重做、保存重开通过目标端测试。
- M03：SQLite 新库与项目隔离、事务回滚、历史/脑图来源和备份验证通过；原库保持不变，兼容限制及升级方法明确。
- M04：OPM 助手、脑图与文档附件功能可用，无业务端点；自动应用沿用来源的显式 autoApply 与校验/审查/回执契约，不跳过安全门。
- M05：桌面壳、网关、资源准备、工作区、进程与备份测试通过；网关不暴露业务路径；不把无签名开发验证称为跨平台发布完成。
- M06：README 固化今后迁移策略；前后端、助手、桌面、契约及隔离浏览器验证有实际结果；密钥扫描零匹配。

## 计划

1. 生成选择清单及备份；混合入口采用最后一个纯 OPM 提交 `8185afa` 作为剥离参照，再接入最新 OPM 增量。
2. 迁移前端/助手/桌面 OPM 闭包，剥离业务导入与入口。
3. 迁移 SQLite 存储适配，移除 PG 选择及快照依赖，保留明确的旧库边界。
4. 先编译和定向验证，再扩大回归；修复本次迁移导致的问题。
5. 核验未选文件和密钥、更新 README 与报告，记录平台/发布限制。

## Checklist

引用：本文 M01～M06。

- [x] 边界确认：用户确认 SQLite-only；只迁移 OPM 与桌面，不修改来源及真实数据。
- [x] M01：逐文件摘要与排除核查完成，来源快照漂移单独记录。
- [x] M02：Web 809、Runtime 631、隔离浏览器 8 项通过；不代表生产发布矩阵。
- [x] M03：SQLite 转换 4 项及桌面备份恢复通过；旧真实库未操作。
- [x] M04：助手 142 项与脑图浏览器通过；仅本机 SDK 模拟，不调用真实供应商。
- [x] M05：桌面 12 项及真实 Electron 开发态 smoke 通过；不构成安装包验收。
- [x] M06：README 策略、验证报告、敏感信息扫描与文档核对完成；依赖/构建告警如实保留。

## 验证与回滚

### SQLite-only 契约后继

本规格对本次目标工作区授权以下兼容适配：活动存储版本为 `2.0`；Recovery/E2E 继续使用真实 SQLite 快照、完整性检查与事务故障位置；Attempt Artifact `0.2` 的内嵌 Schema raw pin 随 SQLite 字段恢复重建。当前 Schema 为 `61440` bytes，SHA-256 为 `fd063b1fbe2531bbf5832c27177476e2bf5e0449469ac0a11c29e83350afe36e`。不得通过读取 checkout 绕过 JAR 内资源 pin，也不得复用旧 clean-source 发布报告。历史设计中的 Java 21 是原发布固定环境，本轮 Java 17 仅用于 SQLite-only 开发构建和测试，不代表既有发布矩阵通过。

使用临时 SQLite、独立测试端口和占位供应商，不调用用户模型服务。先执行 Node/TypeScript/Java 编译及模块测试，再全量核心回归与真实浏览器路径。桌面资源准备须明确实际 Java/Node 架构与许可，缺失条件不得伪造。

回滚仅恢复本次清单中的原文件并移除本次新增文件；保持来源和用户数据不动。原迁移与数据库备份不删除；不得用旧二进制直接打开新基线数据库。
