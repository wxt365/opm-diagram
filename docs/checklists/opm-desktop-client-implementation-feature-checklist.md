# 桌面客户端实现检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[实现规格](../specs/opm-desktop-client-implementation-feature-spec.md)。

- [x] 边界确认：依照规格允许范围实现，保留前序修改与本机数据/服务。
- [x] A1：桌面运行与资源检查（本机 macOS arm64 开发态）。
- [x] A2：网关、安全路径与 SSE 的定向自动化验证。
- [x] A3：握手、监护、工作区锁及本机正常退出；跨平台异常矩阵另列。
- [x] A4：本机持久化/恢复，坏备份拒绝及升级前备份顺序测试。
- [x] A5：设置、可选助手与凭证实现及隔离测试；系统加密和在线 AI 验收另列。
- [x] A6：目标平台资源检查、Forge 构建入口已实现；安装器未构建。
- [x] A7：定向回归、本机真实 Electron smoke 与验证边界已记录。

## 实际证据

以上勾选仅表示本轮源码与本机验证范围完成，不代表需求中全部首版 MUST 或 DT-01～DT-10 发布矩阵通过。

| 验证 | 实际结果与范围 |
| --- | --- |
| 后端编译与 JAR | `mvn -pl services/local-runtime -am -DskipTests package` 通过。系统 Maven 可用，仓库 wrapper 尚不完整，未修改 wrapper。 |
| 后端定向测试 | `DesktopProcessProtocolTest` 4 项、`SqliteStoreTest` 3 项、`LocalRuntimeBootstrapControllerTest` 1 项通过；只读备份校验包含真实迁移后 SQLite、外键及损坏拒绝。 |
| Web | 构建（含类型检查）、lint 通过；`desktop.spec.ts`、`AssistantPanel.spec.ts`、`WorkbenchView.spec.ts` 合计 187 项通过。现有 Router 挂载警告未导致失败。 |
| 助手 | 134 项通过，未调用在线模型。桌面入口不读取开发 `.env`，随机端口及退出握手另有测试。 |
| 桌面自动化 | `npm run desktop:test` 10 项通过，覆盖网关/SSE、同源与路径边界、回执身份、受管进程退出、资源篡改、凭证、工作区锁、备份/恢复和升级前备份顺序。升级测试替换进程启动，仅证明顺序，不等同真实业务 schema 升级。 |
| 最终资源装配 | `npm run desktop:prepare -- --dev-runtime` 通过全量摘要校验：darwin-arm64，563 个生产依赖，27,520 个文件，共 1,343,681,792 字节（约 1.25 GiB，含开发用完整 JDK；不代表安装包大小）。正式 Profile 入口 2 个、资产合计 10 个；清单未包含 `.env*`、凭证、用户数据、Golden/handoff。 |
| 最终真实 Electron smoke | `npm run desktop:smoke` 退出码 0；在画布实际创建对象与过程、改名保存，验证无 Key 可用、独立 Node 助手握手、设置、停服备份、重开保持 SQLite 与 origin、恢复后由三节点回到两节点、退出前提交未按 Enter 的改名、中文及空格路径、正常退出和子进程回收；无页面脚本错误。三次启动分别为 13,793 / 7,373 / 7,278 ms，仅为本机开发态测量。 |
| 源码与文档 | 22 个桌面/助手脚本 `node --check` 通过；7 份桌面文档相对链接检查通过。完整文件清单见实现规格。 |

装配/打包执行全量资源校验，启动复核关键二进制及业务代码/资产。已有根依赖版本未升级；锁文件中的旧内网 tarball 地址规范化为 npm 官方源，新增依赖限桌面工程。

最终 smoke 证据目录：`/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-desktop-smoke-26nAV6`，含 `result.json`、`canvas.png`、`settings.png` 和隔离数据/日志。临时目录由系统清理，不作为发行验收存档。桌面单元、资源装配、smoke、助手及 Java 日志分别为 `/tmp/opm-desktop-node-test-final.log`、`/tmp/opm-desktop-prepare-final.log`、`/tmp/opm-desktop-smoke-final.log`、`/tmp/opm-desktop-assistant-test-unrestricted.log`、`/tmp/opm-desktop-java-test.log`。

## 未运行与发布门槛

- [ ] Windows 11 x64、Intel Mac 与最低 macOS 13 的真实运行、干净环境和原生依赖验收。
- [ ] 使用可分发 JRE/Node、许可说明构建最终安装器，签名/公证及安装/升级/卸载验收；本机资源为 developmentRuntime，Forge 拒绝用于发行。
- [ ] 真实 DeepSeek 多轮、预览、修正、平台校验和最终确认；当前 smoke 仅以假 Key 验证本地助手就绪。
- [ ] 真实系统 safeStorage 加密持久化、应用重开解密及系统权限场景；目前为模拟加密单元测试与真实会话 Key 测试。
- [ ] 完整断网交换、活动 AI/写事务退出、异常断电、磁盘不足、进程树异常回收与真实安装版本迁移/回退矩阵。
- [ ] 最终安装包体积、冷启动和总内存的发布阈值与测量。

本机验证均使用全新临时工作区，既有 Web/Runtime/助手服务及 `runtime-data/sqlite` 保留；未提交 Git，也未生成发行安装包。
