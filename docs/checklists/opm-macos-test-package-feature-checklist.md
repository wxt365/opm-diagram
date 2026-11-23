# macOS 本机测试包检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[测试包规格](../specs/opm-macos-test-package-feature-spec.md)。

- [x] 边界确认：仅本机 arm64 未签名测试包，不改业务契约、真实数据或既有服务。
- [x] M1：运行时来源、摘要及资源排除项。
- [x] M2：应用及 DMG 构建。
- [x] M3：最终应用实际运行。
- [x] M4：挂载、摘要和交付说明。

## 证据

日期：2026-11-16；平台：macOS arm64；应用：OPM Studio 0.1.0。测试包未使用 Developer ID 签名或 Apple 公证，不作为正式发行验收。

| 项目 | 实际结果 |
| --- | --- |
| Java | Azul 官方 API/CDN，Zulu JRE `17.0.21.0.3+1-LTS`，arm64。下载包 SHA-256 `dcf79bdf0f10ab189b95917cd4444d0956538e96fd2c30d6d9f5d480234bfaa8` 与官方元数据一致。最初 Adoptium API 不可达、GitHub 下载超时，未使用下载失败的包。 |
| Node | 官方 Node `22.22.0` darwin-arm64，SHA-256 `5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640` 与官方 SHASUMS 一致。 |
| 资源 | 不带 `--dev-runtime` 的 `desktop:prepare` 通过全量摘要校验；`developmentRuntime=false`，27,260 个文件、804,569,680 字节。清单不含 `.env*`、凭证、用户库、Golden/handoff，包含运行时来源及 Node 完整许可证、JRE legal。 |
| 打包适配 | 修正 `forge.config.cjs` 的 Forge 8 `prePackage(config, platform, arch)` 参数读取；实际打包通过架构及资源检查。无依赖升级、业务 API/schema 或前后端业务改动。 |
| 构建 | Forge `.app` 打包阶段通过；补编译已有 `macos-alias`、`fs-xattr` 后，`npm run make --workspace=@opm/desktop -- --from-package` 退出码 0，生成 DMG；未重复覆盖已生成应用。 |
| 最终应用 | 实际启动 `out/OPM Studio-darwin-arm64/OPM Studio.app/Contents/MacOS/opm-studio`，断言 `app.isPackaged=true`。画布创建对象/过程、改名保存、无 Key 使用、真实随包 Node 助手握手、停服备份、SQLite 重开和恢复、退出提交改名及受管进程回收通过；页面无脚本错误。三次启动 8,303 / 3,088 / 3,267 ms，仅代表本机测量。 |
| 数据保护 | 测试前排他创建此前不存在的桌面目录并写本轮身份标记，测试后正常退出并将整个新建目录移入证据目录；默认桌面目录恢复为不存在，未移动或修改既有开发数据。 |
| 映像检查 | `hdiutil verify` 通过；只读挂载后确认包含应用和 Applications 链接，`app.asar` 及运行时资源清单摘要与已测试 `.app` 一致；检查完成后已卸载。 |

交付：`apps/desktop/out/make/dmg/arm64/OPM Studio-0.1.0-arm64.dmg`，393,442,979 字节（约 393 MB / 375 MiB）。SHA-256：`6c30f4f79539cc2cbe7592f59c9c844fad089a3d43947efcb79f5bf2115b5233`；同目录保存 `.sha256`、`package-result.json` 和 `试用说明.txt`。

最终应用 smoke 证据：`/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-desktop-smoke-kQXDcx`，含结果、截图和归档测试数据。装配、构建、补编译及应用运行日志在 `/tmp/opm-macos-package.ylUq3g`；临时目录不作为长期发行存档。

未验证：Developer ID 签名/公证、最低 macOS 13、Intel Mac/Windows、外部下载后的 Gatekeeper 行为、真实在线模型多轮及系统凭证持久化。既有实现清单中的发布矩阵仍独立保留，不能据本机包通过宣称全部发布要求完成。
