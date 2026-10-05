# P03 状态布局、Operation 与展示—特征符号修正

Work Mode: change；Risk Level: L3；Task Type: bugfix。
Active Playbooks: backend-springboot (primary)、frontend-vue、testing。

## 目标与证据

截图及源码可复现：展示—特征复用 FAN_FILLED 且三角固定向上；Operation 被渲染为矩形；Operation/State 被移动白名单拒绝；UPDATE_LAYOUT 只改父节点坐标。旧测试刻意断言禁用，未覆盖包含关系的拖动。
依据 ISO 19450:2024 §3.47、§7.3.5.2、Figure 19，修正符号与编辑能力。

## 范围

允许：LocalApiService、DraftWorkspaceService、DraftOwnedConstructEdits 及相关 JUnit/MVC 测试；OpenAPI UPDATE_LAYOUT 标注及其生成器/生成产物；OpdCanvas、workbenchRuntime、modeling 类型、opd/core 与 structural renderer 及其测试；新增本任务 E2E；相关设计/旧 Attribute 规格及 checklist。
禁止：SQLite schema/migration、依赖、Profile/Golden/发布资产、用户数据批量改写、工作树切换与提交、无关重构。
不扩展 Operation 的业务执行能力，不改变 Feature owner、Fact 语义、OPL/Trace 或版本保存策略。

## 冻结契约

1. UPDATE_LAYOUT payload 仍仅 occurrence_id 和有限数 x/y。允许当前根 Context 的 OWNED Object/Process/Attribute/Operation/State/Feature State，role、target kind 与语义实体必须一致。State 必须能唯一定位同 Context 的 owned owner occurrence；引用、跨 Context、缺失 owner 仍拒绝。扩展替代旧 Attribute 规格中对 Operation/State 的禁令。
2. State 布局为模型坐标。对象/Feature 移动时，同 Context 的 owned State occurrence 以相同 dx/dy 平移；前端拖动期间即时同步，Runtime 一次事务写入所有变化布局，零额外命令、零中间 Revision。不得移动该对象外部 Attribute/Operation。隐藏状态没有 occurrence，不生成新布局。
3. State 单独移动约束在 owner 内容区：左右/底部 8px，顶部 28px；Runtime 是最终边界，超界位置夹取至允许范围。新建/恢复显示时，将状态归入 owner 内容区，必要时只扩大 owner width/height，不缩小。旧位置不在加载时迁移；下一次相关布局编辑时恢复容纳约束。几何变更只局部回写原 JSON，保留其他字段。
4. 前端使用 Projection 的 width/height（缺失时沿用当前显示默认值）。State/Operation 可以选中拖动；State 装饰跟随本体。只读、工具模式、提交失败回读、草稿 token/幂等/保存机制不变。Operation 采用椭圆，Attribute 仍矩形。
5. 展示—特征独立符号模式：空心大三角内嵌实心小三角；尖端朝向 EXHIBITOR_THING，底边朝向 FEATURE_THING。线段两端显式取消普通箭头，三角按节点中心计算朝向；预览复用同一 RenderSpec。拖动方向仍交给 Runtime 规范化，不改变端点身份与顺序。共享 fan 只修正朝向/箭头，保持其他关系的填充含义。

## 执行计划

先修机器标注和领域布局处理，再补草稿多布局原始 JSON 写回；随后完善节点几何、拖动联动和关系 renderer；最后执行分层测试与隔离浏览器回归，构建并重启当前后端。

## 验收与验证

- OS-01：正反拖线均保留规范 owner/feature；左右/上下布局三角尖端朝 owner；双层三角，无普通箭头，预览一致。
- OS-02：Operation 椭圆、可拖动、刷新保持。
- OS-03：State 可在 owner 内移动，超界夹取；父移动所有状态与装饰同步，只有一次布局命令；新建多状态自动容纳。
- OS-04：真实 SQLite 草稿提交/保存/重开保持多布局；语义/OPL/Trace/ID 不变；越权拒绝、旧 token、重复请求无部分更新。
- OS-05：定向 JUnit/MVC、Vue/renderer 测试、契约生成校验、typecheck/build、隔离 Playwright 与 diff 检查实际通过。

## 回滚

仅撤销本任务增量；不删除现有数据。已保存几何不批量还原，历史 Revision 不改写。本任务不构成发布或 ISO 符合性证明。
