# 本机多地址访问检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[opm-lan-access-spec.md](../specs/opm-lan-access-spec.md)。

- [x] 已确认允许/禁止目录、配置和安全规则变更范围；API/schema/依赖/数据不变。
- [x] 已检查现有代理、v1/v2 守卫、助手 HTTP 入口及测试复用点。
- [x] LAN-01：真实监听和代理读路径。
- [x] LAN-02：受信任来源正例与来源/会话反例。
- [x] LAN-03：回环兼容、v2 协议、内部工具边界及后台监听。
- [x] LAN-04：运行说明与回滚。

## 实际验证（2026-10-08）

- Node 22 执行助手 `node --test test/*.test.mjs`：51/51 通过。HTTP 测试在沙箱内因 EPERM 无法监听，沙箱外执行通过。
- Java 21 执行 `mvn -pl services/local-runtime -Dtest=LocalWriteRequestGuardTest,TrustedWebOriginConfigurationTest,LocalApiControllerTest,DraftWorkspaceControllerTest,DraftSaveControllerTest,LocalRuntimeApplicationTest test`：其余 82 项通过，Spring 集成测试因沙箱限制无法初始化 Mockito；单独在沙箱外重跑 `TrustedWebOriginConfigurationTest` 通过，合计 83 项通过。
- `mvn -pl services/local-runtime -DskipTests package`：成功。新稳定启动 JAR 为 `runtime-data/launches/20261008-lan/runtime.jar`，旧 JAR 保留。
- 三项服务重启后，`lsof` 确认前端 `*:5177`，Runtime `127.0.0.1:17850`，助手 `127.0.0.1:17860`；后台健康均为 UP。
- 在本机分别通过 `127.0.0.1`、`localhost`、`192.168.2.182`、`192.168.64.1` 访问前端：首页、Bootstrap、项目列表均 200；Bootstrap 与直接后台一致且 `no-store`。
- 以上四个地址下，v1 项目、v2 草稿 open、助手 list 的真实代理 POST 使用合法会话及空业务参数均返回业务校验 400；错误来源、端口、伪造或缺失会话、缺少 Origin 均 403。
- HTTP 检查脚本及输出：`/private/tmp/opm_lan_smoke.py`、`/tmp/opm-lan-smoke.log`。未创建业务数据或调用大模型，未验证另一台设备的网络/防火墙，也未执行浏览器交互或真实建模保存。
- 当前额外可信来源为 `http://192.168.2.182:5177`、`http://192.168.64.1:5177`、`http://localhost:5177`。助手写入未提交的 `.env.local`；Runtime 使用启动参数。IP/端口变化需按规格同步更新。

## 文件清单

- `apps/web/vite.config.ts`
- `apps/assistant/src/server.mjs`
- `apps/assistant/test/http.test.mjs`
- `apps/assistant/.env.example`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/ApiWebConfiguration.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalWriteRequestGuard.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWriteRequestGuard.java`
- `services/local-runtime/src/main/resources/application.yml`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalWriteRequestGuardTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/TrustedWebOriginConfigurationTest.java`
- `docs/specs/opm-lan-access-spec.md`
- `docs/checklists/opm-lan-access-checklist.md`

未跟踪运行配置/产物：`apps/assistant/.env.local`、`runtime-data/launches/20261008-lan/runtime.jar`。
