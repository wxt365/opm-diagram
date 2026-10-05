# Checklist: P03 活动 HEAD 稳定 URL 与精确 Revision 深链设计

## Spec Mapping

- Spec：`specs/opm-p03-stable-head-url-and-exact-revision-deeplink-design-task-spec.md`
- 验收：`HEAD-URL-01~08`
- 边界：仅冻结 URL、Header、M01/M09 责任和历史规格取代关系；前端、Runtime、API、Schema、SQLite 和测试代码禁止修改。

## Design

- [x] `HEAD-URL-01` canonical HEAD URL 固定为省略 `revision`；`revision=head` 仅兼容输入并 replace 规范化。
- [x] `HEAD-URL-02` 提交后只更新 Header、编辑基线和投影，不改变 HEAD URL。
- [x] `HEAD-URL-03` 历史 Revision、Snapshot、Baseline 和永久链接统一使用只读 EXACT URL。
- [x] `HEAD-URL-04` 返回活动草稿/创建草稿切回 canonical HEAD URL；无活动草稿的最近 Baseline 恢复切换为只读 EXACT URL。
- [x] `HEAD-URL-05` 精确 Revision fail-closed；Context 在目标 Revision 内回退根并规范化。
- [x] `HEAD-URL-06` viewport、选择、候选、工具和面板状态全部排除于 URL/history state。
- [x] `HEAD-URL-07` 永久链接以 Header 当前实际 committed Revision 为唯一来源。
- [x] 布局是否产生 Revision 与 URL 展示策略解耦。
- [x] M01、M03、M09 与前端 Store/Header 的责任边界已同步。

## Verify

- [x] `HEAD-URL-08` 活动文档冲突扫描无未取代的“活动 committed Revision 写回 URL”规则。
- [x] `HEAD-URL-08` 新增本地 Markdown 链接均可解析。
- [x] `HEAD-URL-08` `git diff --check` 通过。
- [x] 状态明确为 `DESIGN_FROZEN/IMPLEMENTATION_NOT_STARTED`，未误报代码或浏览器验证。

## Verify Record

- `2026-09-11`：活动状态/字段/组件/模块/handoff 文档的旧 URL 规则扫描无命中；P0/P04 已完成规格中的相反条款仅作为历史记录保留，并显式标记由本规格取代。
- `2026-09-11`：9 个受影响文档的本地 Markdown 链接检查通过；两个新增文件无尾随空白并以 LF 结尾。
- `2026-09-11`：`git diff --check` 通过。未执行 Vue、Runtime 或浏览器测试，因为本任务只冻结设计且未修改实现代码。
