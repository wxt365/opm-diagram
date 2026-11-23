# OPM Studio 图标与 Logo

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

日期：2026-11-16。Work Mode：change；Risk Level：L2；Task Type：feature。
Active Playbooks：frontend-vue (primary)、testing。

## 目标与非目标

为 OPM Studio 提供统一的应用标识：用对象的矩形、过程的椭圆和连接表达建模，延续现有蓝色/青色。Web 页头、favicon、桌面启动/设置及 macOS/Windows 打包复用同一矢量源，小尺寸不使用 OPM 字母堆叠。

不改产品名、业务工具图标、画布语义、主题体系、API/schema 或数据库。Logo 是品牌图形，不充当可执行 OPD。与本轮 HTTP 修复共同交付新的本机测试包，保留旧包。

## 范围与契约

允许新增 `assets/brand` 主 SVG/说明，`apps/desktop` 图标生成脚本及 PNG/ICNS/ICO、构建配置、启动/设置标识；允许修改 Web 页头、对应局部样式、favicon/public 资源；允许同步文档与桌面补丁版本。无新增依赖，图标用现有 Playwright 和系统 iconutil 生成。禁止改 `.harness`、真实数据、既有服务及业务模块。

- B1：单一可编辑 SVG 源，派生资源可重建，16～1024px 可识别，透明外边距适合 macOS 图标。
- B2：Web 与桌面使用统一图形，保留文字名与无障碍名称，不改变导航交互。
- B3：ICNS/ICO 接入平台打包配置，构建与真实页面截图检查通过，Windows 仅验证文件结构，不声称安装验收。

## Plan / 边界确认

先完成符号与派生工具，再接入现有品牌入口，检查大小尺寸与实际页面，和 HTTP 修复一起构建 0.1.1 测试包。用户已提出设计图标和 Logo，按现有视觉色彩直接实施，不引入品牌重命名或外部图形素材。

## 验证与回滚

执行资源生成、PNG/ICNS/ICO 文件检查、Web 构建及 lint；实际浏览器检查页面和大小尺寸预览，最终包确认 CFBundleIconFile 及启动正常。撤销本轮标识/配置及新包即可回滚，不覆盖 0.1.0 包和前序修改。
