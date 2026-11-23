# OPM Studio 标识

`opm-studio-mark.svg` 是唯一主图源。矩形代表对象、椭圆代表过程、连线代表建模关系；蓝色延续界面主色，青色与过程视觉对应。它是品牌标识，不表达某一种正式 OPM 关系。

应用内将图形与原有文字名“OPM Studio”组合，不在小图标里放字母。主图保留透明外边距，适用于 macOS Dock；Web 与设置页面同样使用 SVG，避免放大模糊。

在仓库根目录执行 `node apps/desktop/scripts/generate-icons.mjs`，用现有 Playwright Chromium 生成 PNG 和 Windows ICO，macOS 上通过 `iconutil` 生成 ICNS，并同步 Web/桌面 SVG。无需新依赖。生成结果位于 `apps/desktop/assets`；`preview.png` 为大小尺寸及明暗背景预览。Windows 图标文件可生成不等于 Windows 安装测试通过。
