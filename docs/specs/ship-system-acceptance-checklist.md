# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: docs/specs/ship-system-acceptance-spec.md

- [x] 边界确认：仅新增规格、checklist、测试脚本与输出；原模型只读，修改只在新测试副本。
- [x] 复用确认：现有 Playwright、UI test ID、OPD JSON 导入导出、hybrid-save 用例。
- [x] A01–A08：最终实际浏览器验收 38 PASS、0 FAIL、0 BLOCKED；见 tests/system/output/2026-10-12T06-24-26-935Z/report.json。
- [x] 浏览器实际执行与报告审查：Edge + Playwright；逐项截图、trace.zip 和 Markdown 报告齐备。
- [x] 独立数据审计：tests/system/audit-ship-evidence.mjs 实际执行 exit 0；8 项 PASS；四图节点/边数量、9 个语义数组导入、原模型完整保护、意外 HTTP 与 pageerror 均核对。
- [x] 异常保留：根图 5 组重复边界关系展示；试跑 A06-05 上游过载失败有截图、run 记录和 trace；最后重跑成功不抹除历史异常。
- [x] 语法验证：两个新增 .mjs 的 node --check 均实际通过。
- [x] 范围确认：产品代码、公共契约、依赖和用户原模型未修改；测试项目留存。未执行跨引擎、压力和整图 AI 修改专项，限制已写入 Spec。

## 试跑审查

- 2026-10-12T06-07-25-122Z：开发试跑，OPL 定位器错误，中断；非验收结论。
- 2026-10-12T06-10-49-368Z：试跑 28 PASS / 7 FAIL，入口折叠及固定像素偏移导致测试驱动误报。
- 2026-10-12T06-15-54-072Z：试跑 33 PASS / 5 FAIL，直接定位 SVG rect 被自有文字层遮挡，改用 group 与实际缩放几何。
- 2026-10-12T06-20-30-202Z：试跑 33 PASS / 5 FAIL，Owned 组边界误选、异步导航等待不足及上述上游助手过载。错误分类与原始证据保留。
- 2026-10-12T06-24-26-935Z：最终完整回归 38 PASS / 0 FAIL；该次才作为最终功能验收结果。
