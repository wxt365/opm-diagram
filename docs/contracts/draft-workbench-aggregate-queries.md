# 草稿工作台聚合读取

用于减少每次编辑后的 HTTP 往返。保留原有 open、projection、text、navigation、findings 和 relation-catalog 接口。

两个新接口均为只读 POST，路径前缀为 `/api/v2/projects/{project}/models/{model}/draft`，请求沿用 `DraftQueryRequest`（request_id、draft_token、context_id）。仍使用原严格解码、工作台访问校验及 exact token 检查，旧 token 返回 409，新规则绑定返回 RULE_VERSION_CONFLICT；不会修改草稿。

| 接口 | 返回字段 | 字段契约 |
| --- | --- | --- |
| `/canvas` | opened、projection | OpenDraftResult、DraftProjectionResult |
| `/details` | navigation、findings、catalog、text | DraftNavigationResult、DraftFindingsResult、DraftRelationCatalogResult、DraftTextResult 或 null |

一次请求只读取一份经过校验的草稿文档；所有子结果使用同一个请求标识、token 和 context。各非空字段按现有 draft-workspace-v02 schema 校验。canvas 返回真实保存状态，前端不推测保存成功。details 的 catalog 为 selection_id=null 的目录；选中关系需要的目录继续使用原接口。

只有已有模型诊断且文本生成出现 DRAFT_EDIT_REJECTED 时，details 允许 text=null，工作台显示诊断提示；存储、网络、协议等故障正常报错，不作为空结果成功返回。

普通编辑依次执行 capabilities → commands → canvas，随后将四项辅助信息合并为 details。辅助刷新延后180ms，连续编辑只发送尚未开始的最新版本；创建细化图立即刷新导航。状态候选在点击“创建状态”时查询。前端目录与候选结果仅在相同完整 token 和 scope 下复用，最多32项，失败项移除。

宿主代理将 canvas、details 作为只读查询转发，不获取主题写锁；commands、save、pin 等继续保留写锁。升级时先部署 Runtime 和宿主代理，再更新工作台前端包。
