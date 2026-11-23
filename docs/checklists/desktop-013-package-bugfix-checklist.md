# macOS 0.1.3 构建检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[滚动条修复安装包](../specs/desktop-013-package-bugfix-spec.md)。

- [x] 边界确认：仅补丁版本、装配、隔离验证和交付文档，不修改业务契约、依赖、用户数据或旧包。
- [x] P1：修复产物、版本与资源校验。
- [x] P2：最终应用 SQLite smoke 和画布稳定性。
- [x] P3：DMG 验证与交付。

## 实际证据

- 桌面版本、lock 和资源清单为 0.1.3。已验证的 Web 产物 `index-B_O_4bI6.js` 包含关闭 X6 自动取整和宽高向下取整的修复；后端 JAR 与 0.1.2 SHA-256 一致，无业务后端变化，未重复构建。前序画布自动化、生产构建证据见[画布检查清单](canvas-scrollbar-flicker-bugfix-checklist.md)。
- `npm run desktop:test` 12/12 通过（`/tmp/opm-013-tests.log`）。发行装配及最终应用 `verifyResources` 全量通过，共 27,261 个文件，47 个 Web/助手源文件与当前构建/源码摘要一致，无禁止配置、数据库路径；`developmentRuntime=false`，随包 Java 17.0.21.0.3+1-LTS、Node 22.22.0。日志 `/tmp/opm-013-prepare.log`、`/tmp/opm-013-resources.json`。
- Forge 使用已验证本机 Electron 缓存成功生成独立版本应用和 DMG，日志 `/tmp/opm-013-make.log`。
- 最终打包应用隔离 SQLite smoke 通过，三次启动 8,845 / 3,539 / 3,562 ms；设置窗口重复关闭重开、真实对象/过程创建改名保存、重开持久化、备份恢复、退出保存、子进程回收通过。证据 `/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-desktop-smoke-WuOoDL/`。使用全新系统主目录，不操作既有工作区；仅用假 Key 验证助手本地握手，不证明在线模型调用。
- 最终包空图在默认/强制常驻滚动条 × 3 种窗口宽度 × 3 种缩放共 18 组测试中，稳定采样均为单一尺寸、0 次变化，无页面错误；证据 `/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-013-scrollbar-7xnWg3/`，日志 `/tmp/opm-013-scrollbar.log`。高缩放时视口小于最小画布，仍保留稳定的必要滚动条。
- `hdiutil verify` 通过，只读挂载确认应用、Applications 链接及 `app.asar`/资源 manifest 摘要一致，已卸载；0.1.0、0.1.1、0.1.2 旧 DMG 摘要均与构建前一致。`git diff --check` 通过。

交付：`apps/desktop/out/0.1.3/make/dmg/arm64/OPM Studio-0.1.3-arm64.dmg`，395,727,998 字节；SHA-256：`e086831ab74edb08d1fe0e75a3acf5c0f0335541f761c864f644a185c6bce88d`。同目录保存安装说明、摘要、资源/映像验证及 smoke/画布采样结果。

未执行 Developer ID 签名、公证、Intel/Windows、最低 macOS 或真实用户工作区升级验收；未安装或替换用户应用。未将此前尚未定位的网关 `fetch failed` 宣称为已修复。
