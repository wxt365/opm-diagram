# Windows x64 交叉构建检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[交叉构建测试包](../specs/desktop-windows-cross-package-feature-spec.md)。

- [x] 边界确认：独立测试包，不改 API/schema/依赖、用户数据、原生构建守卫和旧包；无真实 Windows 环境。
- [ ] W1：工具链、目标运行时与依赖来源/架构/摘要。
- [ ] W2：安装包和资源结构验证、旧包保留。
- [ ] W3：交付或准确记录阻断。
