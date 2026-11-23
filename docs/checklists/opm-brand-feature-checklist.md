# 品牌标识检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[图标与 Logo 规格](../specs/opm-brand-feature-spec.md)。

- [x] 边界确认：只替换品牌入口，不改工具图标、画布语义及业务行为。
- [x] B1：源图与各尺寸派生资源。
- [x] B2：Web、桌面及实际预览。
- [x] B3：打包接入与新版本验收。

## 证据

`assets/brand/opm-studio-mark.svg` 为统一源图，使用对象矩形、过程椭圆和连接；`generate-icons.mjs` 执行通过，产出 1024 PNG、ICNS、含 16/32/48/64/128/256 尺寸的 ICO、SVG 副本与明暗背景预览。`file` 确认资源格式正确，已查看 16～96px 预览及实际画布/设置截图。

Web 页头保留返回项目库交互及原无障碍名称，favicon、桌面启动/设置均接入。Web build（含类型检查）及 lint 通过；新增 img 自闭合格式警告已修正后重跑通过。仅有原有大 chunk 构建提示，不作为性能达标证据。

0.1.1 实际 `.app` 和 DMG 均生成；Info.plist 的 CFBundleIconFile 对应文件摘要与新 ICNS 相同。DMG 挂载后图标、应用归档与已测试应用一致；macOS 最终应用在隔离目录通过真实画布及设置页检查。Windows ICO 仅验证格式和配置，不代表 Windows 安装验收通过。

最终应用截图和测试结果：`/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-desktop-smoke-EMmRjP`；图形预览 `apps/desktop/assets/preview.png`。打包路径、大小和摘要见 [HTTP 修复清单](desktop-lan-http-bugfix-checklist.md)。

仅升级桌面包到 0.1.1（根 lock 同步），依赖版本不变。打包输出按版本分目录，旧包保留；未修改真实数据、服务、公共 API/schema，未签名公证或提交 Git。
