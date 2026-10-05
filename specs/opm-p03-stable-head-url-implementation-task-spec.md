# P03 稳定 HEAD URL 与精确版本入口实现

Work Mode: change；Risk Level: L3；Task Type: bugfix。
Active Playbooks: frontend-vue (primary)、testing。

## 目标和根因

实现 [冻结设计](opm-p03-stable-head-url-and-exact-revision-deeplink-design-task-spec.md) 的 HEAD/EXACT 定位。旧 View 监听 committed Revision 并 replace URL，Store 又把等于 Head 的精确链接判为可编辑；旧测试恰好断言该旧行为，未覆盖两种定位意图。

## 边界

允许修改 apps/web 的工作台、Store、路由定位 helper、现有 API 封装及对应测试，projectModel 的空 Head 展示映射；LocalApiService/Controller 和对应测试；OpenAPI 的 workspace-session 可选 revision/context 参数及 Model.head_revision 可空表示；新增本规格、checklist 和 tests/e2e/workbench-location.spec.ts。
允许为上述目标同步契约说明，不增加依赖，不修改 SQLite schema、命令 payload、Profile、发布 runner、运行数据、.harness 或其他既有修改。现有关系标签编辑、画布平移和反馈布局必须保留。

M09（Runtime）解析 HEAD、精确版本归属、目标根 Context、无 Head 时最近 Baseline；可选查询参数不改变旧无参调用。无 Head 用 head_revision=null 表示。精确入口只读是浏览会话策略，不伪称 HTTP 无状态命令新增了授权模型。

非目标：新增 Snapshot 管理、创建分支草稿 API、撤销重做实现、发布验证。当前 Runtime 无创建草稿/Snapshot 管理接口，本轮不伪造入口；已有固定 Revision 可统一 EXACT 打开。

## Plan

1. 在原 workspace-session 增加可选定位参数，由服务读取真实 Revision，核对归属并返回目标 Context；历史投影不依赖活动 Head 存在。
2. 分离 Store 定位模式和 committed Revision；命令重读保持模式，阻断 EXACT 写入及过期请求回写。
3. Router/View 仅在入口解析成功时规范化 URL；增加历史版本入口、永久链接和返回活动草稿。禁用只读拖动，保留平移。
4. 定向服务/组件测试，再执行真实浏览器回归、类型检查、lint、构建及差异检查。

## 验收与验证

- URL-I01：HEAD/兼容 head 规范化；连续语义及布局提交 URL 字节不变，Header 为真实 Revision。
- URL-I02：当前/历史精确 Revision 一律只读；重开及前进后退不漂移、不重放命令；过期响应不改变新入口。
- URL-I03：非法/跨 Model Revision 拒绝且保留错误 URL；无/非法 Context 回退目标根并提示；加载失败关闭写入口。
- URL-I04：无 Head 时最近 Baseline 只读 EXACT；无可用版本明确报错。Runtime SQLite 定向用例覆盖。
- URL-I05：永久链接使用当前投影 Revision；历史入口及返回 Head 可用；视口不写 URL；原画布回归通过。
- URL-I06：前后端测试、typecheck、lint、build、OpenAPI 验证与 diff --check 记录真实结果；未执行发布验证。

## 回滚

仅反向应用本轮定位变更，保留工作区此前修改。无数据迁移。前后端及 OpenAPI 一起回滚，避免会话接口版本混用。
