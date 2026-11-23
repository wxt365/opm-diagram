# Plan / Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: specs/opm-state-editor-sync-ime-spec.md

边界确认：State helper/检查器及相关测试文档允许，公共契约/schema/依赖/配置/后端禁止。
实现：store 观察已确认 State 字段，按前一确认值逐字段同步未改输入（按 Vue 批次观察以免投影临时选择变化覆盖脏输入）；检查器跟踪组合输入，阻止提交和离开；先定向再全量验证。

- [x] AC1：真实草稿 session.edit/read 回读夹具，State A→B→撤销 A→重做 B→撤销 A，保存/切换不增加 UPDATE_STATE；外部改名回读同步。
- [x] AC2：外部回读同步干净角色并保留失败名称、脏角色；切换再选择初始化；既有同一批次设置选择/输入的候选失败测试保留。
- [x] AC3：检查器组合期间表单提交、统一 finish、关闭均阻止，pending 状态为 true；compositionend 使用 DOM 最终文字提交，成功解除保护。
- [x] AC4：定向 156 项通过；最终 80 文件、776 项全部通过，lint、vue-tsc + Vite build、git diff --check 退出码均为 0。

日志：test-results/state-sync-ime-targeted.log、state-sync-ime-unit.log、state-sync-ime-lint.log、state-sync-ime-build.log。首次定向验证发现新选择初始化 watcher 会覆盖同批次输入，调整为沿用 selectConstruct 初始化、watcher 只处理同一个已选 State 后复跑通过。
未运行真实中文输入法浏览器测试、浏览器矩阵或后端测试；composition 事件测试不能替代这些验证。构建保留既有 bootstrap script/超过 500KB 分包提示。
