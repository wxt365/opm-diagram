# P03 工具栏图元一致性修正

## 执行边界

- Work Mode: change；Risk Level: L2；Task Type: bugfix。
- Active Playbooks: frontend-vue (primary)、testing。
- 当前目录修改，不创建 worktree、不提交，保留已有修改。

## 目标与根因

五个创建按钮使用 Lucide 通用图标，与工具链设计第 3.4 条不一致。关系缩略图的双向标记多画两条斜边；状态矩形在箭头之后绘制且与箭头相交，遮住箭头。现有测试只检查 glyph 类型，没有核对 SVG 端点几何。

## 允许与禁止范围

允许修改 WorkbenchView.vue、RelationToolSymbol.vue，新增 ElementToolSymbol.vue 与对应组件测试，更新 WorkbenchView.spec.ts、本规格、对应 checklist 和工具链设计。允许必要的局部 SVG 样式。禁止 API、Schema、Runtime、Profile、数据库、依赖、发布证据变更和业务数据操作。

## 冻结行为

1. Object 为矩形，Process 为椭圆；Attribute/Operation 分别复用矩形/椭圆轮廓，左侧短分支仅为工具栏归属提示，不是新增标准符号。State 为矩形容器内圆角矩形。五按钮使用 20px SVG、统一 currentColor/1.6px 线宽，无文字、立方体、齿轮和虚线圆。
2. 保持 title/aria-label、禁用条件、事件、按钮尺寸和工具栏单行布局。SVG 在已有按钮可访问名称下为装饰。
3. 双向标记及互惠关系共用两端相反侧半箭头；区别由现有名称和正式关系标签承担，不额外发明箭头。
4. 状态指定关系的箭头尖端在状态框边界，箭身在框外。双向箭头两端均适用。状态指定展示关系只画连接该状态的一条分支，禁止线穿过状态框。
5. Control 工具栏继续使用代表符号与 e/c；不能将其视作最终 Fact 预览。既有预览仍由基础关系 RenderSpec 和 Control decorator 生成。本包不改变该链路。
6. 当前恢复缩放按钮提示改为“恢复 100% / Reset zoom to 100%”，不声称自动适配内容；真正内容适配不在本包实现。

## 验收与验证

- ICON-01：五类图元与上述轮廓一致，原创建入口/禁用条件不变。
- ICON-02：双向半箭头仅两条斜边；状态生成、双向影响、标记关系不遮箭头；状态展示无穿框线。
- ICON-03：代表 Control、未知 Symbol 拒绝行为和 34 ID 映射保持；缩放提示与行为一致。
- ICON-04：定向 Vue 测试、lint、Node 22 build、diff 检查；实际浏览器检查工具栏和展开面板。

## Plan

先冻结图元和边界，再替换五个图标及局部关系几何，补足可见符号回归；最后执行定向测试和浏览器检查，不重新运行无关后端发布链。

## 回滚

仅撤销本次图标、提示、测试和文档修改；不覆盖同文件中的既有编辑，不触及模型数据。
