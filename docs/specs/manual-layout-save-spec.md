# 布局仅手动保存

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: feature; Active Playbooks: none (primary).

## Lean scope

目标：拖动结束仅更新本地布局；多次移动、对齐和自动布局应用、布局撤销/重做合并为手动保存时一次 UPDATE_LAYOUT_BATCH。消除每次移动的日志写入和完整工作台回读。
非目标：改变语义编辑自动持久化、后端保存校验、API、schema、依赖或已有用户模型。
允许：apps/web/src/stores/workbench/workbenchLayout.ts、workbenchRuntime.ts、modules/workbench/WorkbenchView.vue、useWorkbenchNavigation.ts、WorkbenchView.spec.ts；新增 tests/system/manual-layout-save.mjs 和 output 下证据，更新已有 ship-acceptance.mjs 的拖动断言；docs/specs 本任务文档及船舶方案的行为版本说明；隔离测试副本。
禁止：后端与助手实现、公共契约、配置、依赖、原船舶数据、无关现有改动。契约影响：无。

## 验收

- M01：拖动/对齐/自动布局确认和撤销重做无网络布局写入、无 draft edit_seq 变化；本地几何正确，回到原位置不再标记未保存。
- M02：手动保存将本图最终变化合并为一次批量布局编辑，再调用 SAVE；未改变位置不发送布局；保存成功刷新保持。
- M03：其他语义编辑和定时状态查询不提交或丢失本地布局；后端快照回读叠加本地位置，删除的节点移出待保存集合。
- M04：布局提交/保存失败保留可恢复状态，不重复提交已确认布局；保存过程中禁止移动；旧响应不覆盖新模型。
- M05：未保存布局显示明确提示；切图/历史/离开提供保存、放弃、取消；刷新/关闭触发浏览器未保存提示。永久链接和 JSON 导出不会静默忽略本地位置。
- M06：自动保存只处理已提交语义，不提交本地布局；船舶副本真实拖动验证请求数量、12秒等待、手动保存与刷新。

验证：前端定向单元测试、typecheck、lint、全前端回归及隔离船舶浏览器检查。回滚：撤回本任务前端文件与测试，不迁移数据库。

## Plan

在现有布局 owner 保存原始/最终几何，复用批量提交入口，投影回读时叠加。统一手动 SAVE 时 flush；导航以未保存布局对话框拦截，使用现有焦点辅助。修改原布局用例预期并增加失败、异步和语义混合测试。最后运行船舶隔离副本浏览器验证。
