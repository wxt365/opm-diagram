# 工具栏图元修正 Checklist

规格：`specs/opm-p03-toolbar-symbol-fidelity-bugfix-task-spec.md`。

- [x] 边界确认：仅前端图元与提示；API/Schema/数据/依赖不变。
- [x] Plan：采用规格内顺序；保留当前目录已有修改。
- [x] ICON-01：WorkbenchView 既有页面回归增加五类 SVG 轮廓断言，创建/禁用流程原样保留。
- [x] ICON-02：RelationToolSymbol 6 项回归覆盖状态箭头边界、双向影响两端、状态展示和两类半箭头。
- [x] ICON-03：34 ID 映射、未知 ID 拒绝和 Control 代表符号原样保留，缩放提示已修正并断言。
- [ ] ICON-04：自动化已通过；实际浏览器视觉检查受环境阻断，尚未完成。

## 实际验证（2026-09-15）

- Node v22.22.0。
- `npm run test --workspace=@opm/web -- src/modules/workbench/RelationToolSymbol.spec.ts src/modules/workbench/opd/core/relation-tool-symbol.spec.ts src/modules/workbench/WorkbenchView.spec.ts`：3 文件、84 项通过。
- `npm run build --workspace=@opm/web`：通过（含 vue-tsc）。现有 `/opm-bootstrap.js` 保持未打包，Vite 提示保留，不改启动契约。
- `npm run lint --workspace=@opm/web`：通过。
- `git diff --check`：通过。
- 浏览器工具 `cua.getState()`：返回 `Codex auth token is unavailable`；`curl http://127.0.0.1:5173/` 退出 7，当前环境无法连接。未宣称完成桌面/窄屏视觉验收，也未改动浏览器模型数据。

恢复浏览器连接后：检查五个创建图标，展开过程/结构目录核对状态箭头和半箭头，检查窄视口单行布局；本轮不创建测试业务数据。
