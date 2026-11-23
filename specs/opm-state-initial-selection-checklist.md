# Plan / Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/opm-state-initial-selection-spec.md
边界确认：相关 runtime、测试、文档/specs 允许，公共契约/schema/配置/依赖/后端禁止。
实现：复用 State 初始化函数；初次加载显式初始化最终选择，普通草稿回读仅在最终目标变化时初始化；保持同目标字段同步。

- [x] AC1：草稿 State 首项先于 owner 返回，直接开面板正确，保存关闭切换零 UPDATE_STATE；回退新 State 初始化正确。
- [x] AC2：只读 State 首项默认选择及重复加载覆盖旧缓冲，关闭选择不受阻，无业务命令。
- [x] AC3：同 State 普通命令回读保留名称和角色脏输入；既有撤销重做/候选失败/组合输入全量回归通过。
- [x] AC4：最终 80 文件、778 项全部通过；lint、vue-tsc + Vite build、git diff --check 退出码均为 0。

证据：test-results/state-initial-selection-unit.log、state-initial-selection-lint.log、state-initial-selection-build.log。定向 WorkbenchView 153 项通过后增加自动回退断言，最终以上全量验证覆盖。构建仍有既有 bootstrap script 与超过 500KB 分包提示。
本轮未执行真实浏览器 E2E 或后端回归，不将 Vue/草稿会话夹具测试表述为浏览器验收通过。
