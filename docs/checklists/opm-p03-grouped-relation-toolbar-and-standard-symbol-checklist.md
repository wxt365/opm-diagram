# Checklist: P03 单行分组关系工具栏与标准符号

## Spec Mapping

- 规格：`specs/opm-p03-grouped-relation-toolbar-and-standard-symbol-task-spec.md`
- 验收：`P03-REL-TOOLBAR-01` 至 `P03-VERIFY-01`
- 边界：只修改前端工具栏、Catalog 状态、缩略符号、测试和设计记录；Runtime、API/schema、SQLite、Profile、依赖与发布链不变。

## Plan

- [x] 冻结主工具栏单排合并、纯图标三组、竖线分隔、`5/4/5` 高频直达、完整目录下拉、双语 tooltip、selection-aware Control 和未知 Symbol 无 fallback。
- [x] 冻结关系手动路由仍未开放的真实边界。
- [x] 冻结 34 项标准双语显示表、可读禁用原因、机器字段禁止暴露和紧凑尺寸。

## Build

- [x] `P03-REL-TOOLBAR-01/02/03` 主工具栏单排合并、纯图标高频直达、双语 tooltip 与完整目录下拉完成。
- [x] `P03-REL-SYMBOL-01/02` 标准缩略符号与未知 Symbol 拒绝保持完成。
- [x] `P03-REL-ROUTE-01` 未引入 vertex handle 或关系布局写入。
- [x] `P03-REL-TOOLBAR-02/04` 关系 tooltip 与紧凑尺寸修正完成。

## Verify

- [x] `P03-VERIFY-01` 定向/全量 Vue、lint、typecheck、build、P03 Playwright、浏览器视觉检查和 diff 检查完成。
- [x] `P03-VERIFY-01` 重新执行 34 项 tooltip、桌面/窄屏视觉和受影响回归。

实际结果：Node `v22.22.0` 下先以新增回归稳定复现旧 tooltip 暴露端点代码；修正后定向 Vue `27/27`、根级全量 Vue `85/85`、lint、typecheck、contract validate、build、P03 Playwright `14/14` 与 `git diff --check` 通过。桌面 Chrome 无障碍树逐项确认标准名称和禁用原因；390x844 Chromium 实测常驻按钮`34x32`、常驻符号`32x18`、下拉符号`42x20`、浮层右边界`382<390`，无裁切或重叠。构建保留既有 `/opm-bootstrap.js` 非 module 提示，不影响成功结果。
