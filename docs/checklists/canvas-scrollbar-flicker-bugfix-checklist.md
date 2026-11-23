# 画布滚动条闪烁检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[尺寸循环修复](../specs/canvas-scrollbar-flicker-bugfix-spec.md)。

- [x] 边界确认：仅画布尺寸和回归，不修改 API/schema/依赖、用户数据或安装包。
- [x] S1：旧 Electron 空图稳定采样 60 帧出现 8 次尺寸切换；修复后 3 种窗口宽度 × 3 种缩放共 9 组均为 0 次切换。新增浏览器回归在旧实现上因画布尺寸超出容器失败，修复后通过。
- [x] S2：小视口横纵滚动、真实画布拖动及多尺寸缩放通过；隔离 SQLite + Electron 画布实际创建对象和过程共 2 个节点并保存成功，无页面异常。
- [x] S3：定向单元测试 39/39、独立工作台浏览器测试 6/6 通过；Web 类型检查与生产构建通过，定向 ESLint 无错误或警告，`git diff --check` 通过。构建仅有现有的大 chunk 提示。

验证证据：`/tmp/opm-scrollbar-e2e-before.log`、`/tmp/opm-scrollbar-unit.log`、`/tmp/opm-scrollbar-e2e-after.log`、`/tmp/opm-scrollbar-web-build.log`；Electron 结果与截图位于 `/private/var/folders/d_/qp5f0jk540v42p1bg1cy6vy80000gn/T/opm-scrollbar-fixed-S1VCxn/`。测试使用独立临时 SQLite 工作区，未修改真实模型或配置。

交付边界：本轮修复源码并构建 Web 供验证，未重新打包；现有 0.1.2 安装包不含本次修复。
