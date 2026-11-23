# macOS 0.1.2 构建检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[构建与窗口修复](../specs/desktop-012-package-bugfix-spec.md)。

- [x] 边界确认：仅窗口关闭根因、补丁版本和本机隔离测试包；保留旧包和真实数据，无公共 API/schema/依赖变更。
- [x] P1：旧包复现、修复后的真实窗口关闭与重开。
- [x] P2：桌面回归及最终包 SQLite smoke。
- [x] P3：装配资源和凭证排除检查。
- [x] P4：独立版本 DMG 校验与交付。

## 实际证据

- 旧 0.1.1 最终包使用新增 smoke 单独关闭设置窗，捕获 `Object has been destroyed` 并断言失败，日志 `/tmp/opm-012-baseline.log`；根因修复为创建时缓存 webContents 身份，关闭回调不再访问销毁对象。
- `npm run desktop:test`：12/12 通过。最初沙箱运行因监听端口 EPERM 失败，解除本机测试端口限制后全量通过，日志 `/tmp/opm-012-tests.log`。
- `desktop:smoke` 开发态通过；最终 0.1.2 打包态设置窗重复关闭/重开、真实画布创建和改名、保存、独立 Node 助手假 Key 握手、SQLite 备份恢复、重开持久化、退出保存、子进程回收均通过，页面与主进程异常列表为空。最终包三次启动 8,532 / 3,431 / 3,164 ms，证据目录 `/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-desktop-smoke-FTIRVM`。测试工作区通过独立系统主目录隔离，未接触既有数据。
- 版本刚更新、尚未装配时的 smoke 被“应用与资源版本不一致”正确拒绝；重新装配后验证通过。Web/助手文件和 JAR 与上一轮已验证产物摘要一致，未重建无变化的业务代码。
- 使用已分发的 Java `17.0.21.0.3+1-LTS`、Node `22.22.0` 装配 27,261 个文件，`developmentRuntime=false`；装配和最终应用 `verifyResources` 全量通过，无 `.env*`、用户库或凭证路径。
- Forge 默认重复下载 Electron 耗时；停止本轮下载进程后改用程序接口显式传入缓存。缓存 ZIP 校验、版本 45.3.2 与已安装核心二进制摘要一致；ZIP SHA-256 `8bdf5d55fbcc2c348b5d34b9e87a364cd2947d00b7c8bfadc6cc50233cd79ac6`。未改动打包配置或依赖。成功日志 `/tmp/opm-012-make-local.log`。
- `hdiutil verify` 通过；只读挂载确认应用和 Applications 链接，映像内 `app.asar`、资源 manifest 与已测试应用摘要一致，已卸载。0.1.0 和 0.1.1 DMG 大小及 SHA-256 与本轮前一致。

交付：`apps/desktop/out/0.1.2/make/dmg/arm64/OPM Studio-0.1.2-arm64.dmg`。同目录保存安装说明、`.sha256`、`package-result.json` 和 `smoke-result.json`。

未执行 Developer ID 签名、公证、Intel/Windows、最低 macOS 和跨版本真实用户工作区升级验收；不作为完整发行矩阵通过。此次仅假 Key 本地助手握手，不重复发送在线模型请求；此前真实网关联调证据独立保留。
