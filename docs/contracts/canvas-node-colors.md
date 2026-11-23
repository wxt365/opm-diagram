# 画布统一类型配色

右侧基本信息中的颜色选择器修改同一 runtime 部署内全部画布的同类节点。类型为 object、process、attribute、operation、state；不按名称、ID 或领域类型匹配。自动保存，无需保存模型草稿；颜色不改变模型内容、版本或发布校验结果。新建元素直接继承所属类型的统一颜色。

## 接口

GET `/api/v1/canvas/node-colors` 返回不可缓存的 `{ "data": { "object": { "stroke": "#1976d2" } } }`。

POST `/api/v1/canvas/node-colors/{kind}` 请求 `{ "stroke": "#1976d2", "fill": "#ffffff" }`，返回 `{ "data": { "stroke": "#1976d2", "fill": "#ffffff" } }`。请求原子替换指定类型配色，省略字段使用类型默认色，`{}` 恢复该类型全部默认色。其他类型不变；同类型并发写入以最后一次成功提交为准。

类型使用上述固定枚举，字段只允许 stroke/fill，值必须是六位十六进制颜色，保存时转小写。非法请求返回400；持久化错误返回503 PERSISTENCE_FAILED。沿用现有 LocalWriteRequestGuard、会话与来源校验；平台嵌入入口仅对上述读取和五类写入路径放行，仍先核验主题绑定。

前端等待服务器确认后更新展示；写失败保留旧配色并在面板显示错误。已有打开的同源窗口通过 BroadcastChannel 通知刷新；窗口获得焦点、打开画布以及可见页面每30秒重新读取服务端。广播仅用于通知，设置始终以服务端为准。不同设备通过定时或焦点刷新更新。

## 存储和兼容

Flyway V5 在 runtime 的 PostgreSQL schema 新建 canvas_node_color，kind主键，stroke/fill可空。全局展示设置不放入 layout、模型草稿或项目快照；迁移无业务回填，不需要清空任何数据。先更新 runtime 运行迁移，再更新平台代理和工作台包。

当前工作台将类型配色作为唯一颜色来源，已有 layout.appearance 不再影响它的显示；历史颜色数据和 Revision 0.7、Digest/5 读取继续保留。直接使用旧节点渲染器但未提供统一色板的调用仍兼容个体配色。恢复默认不重新启用旧个体覆盖。

回滚工作台与平台代理可保留新增表；不删除已保存颜色或降级模型版本。运行时退回旧版本时需按既有 Flyway 校验策略处理较新迁移，不对已有迁移进行编辑。
