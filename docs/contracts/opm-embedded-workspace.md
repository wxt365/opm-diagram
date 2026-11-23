# 嵌入工作台 API（0.2.0）

新增接口保持原 v1/v2 编辑协议不变，不新增数据库 schema。`source` 为宿主身份，`binding` 为 OPM 身份，不能混用。

## 初始化会话

`POST /api/v1/integration/session`，JSON `{}`。
浏览器自动发送 Origin；远程模式需要 `Authorization: Bearer <接入凭证>`。响应不缓存：

```json
{
  "sessionToken": "服务会话令牌",
  "profileBinding": {
    "profile_id": "profile.iso19450.2024.draft",
    "profile_version": "0.2.0",
    "rule_set_id": "rules.iso19450.2024.draft",
    "rule_version": "0.1.0"
  }
}
```

前端客户端保存令牌并在后续所有 API 请求携带 `X-OPM-Session`，不写入 window 全局。Runtime 重启后客户端需重新初始化；组件提供 `reload()` / 重连按钮。

## 查找或创建关联

`POST /api/v1/integration/workspace`，携带 `X-OPM-Session`：

```json
{
  "request_id": "request.embedded.随机身份",
  "source": {
    "systemId": "asset-management",
    "projectId": "21e3-宿主UUID",
    "projectName": "外部项目",
    "modelId": "456-宿主模型ID",
    "modelName": "外部模型"
  }
}
```

systemId 可省略，默认 default；多宿主系统应分配不同标识。宿主 ID 不要求以字母开头，各字段为非空字符串，最长 512 字符。项目/模型显示名不是主键，后续变名不创建新资源或自动重命名后端对象。
同一项目中的不同宿主模型可以同名；为兼容原模型名唯一约束，必要时后端为内部模型名称追加身份后缀，组件仍显示宿主传入的名称。

响应：

```json
{ "projectId": "project.后端身份", "modelId": "model.后端身份" }
```

宿主可保存响应后，下一次直接请求：

```json
{
  "request_id": "request.embedded.随机身份",
  "binding": { "projectId": "project.后端身份", "modelId": "model.后端身份" }
}
```

binding 优先于 source；显式 binding 缺失/格式错误、资源归档或不存在时返回 400/404，不回退新建。OPM ID 必须符合原 StableId 及项目存储路径长度约束。

幂等关联复用既有 idempotency_record，命令身份是 JSON 数组 SHA-256（项目：systemId+项目ID；模型再追加模型ID）。创建事务提交后响应丢失可从记录回读。模型关联墓碑记录不持有修订外键，永久删除模型后 source 再次进入返回 404，不默默重建。无需数据迁移。当前共享存储仍按单 Runtime 写入实例部署，不提供多副本跨进程锁。

## 部署模式

默认本机模式：原 bootstrap/v1/v2 接入保持有效，JSON session 允许相同本机 Host/Origin 和已配置可信来源。

远程模式：`OPM_REMOTE_ENABLED=true`，必须配置 `OPM_EMBEDDED_ACCESS_TOKEN`。显式 trusted origins 精确允许外部页面；保留回环开发来源。所有业务读取与写入都验证来源和会话；GET 同源浏览器缺少 Origin 时从 Referer 提取来源。支持 CORS GET/POST/OPTIONS，允许 Content-Type/X-OPM-Session/Authorization，拒绝未授权来源。旧 bootstrap 不向非回环请求地址下发会话；远程网关仅开放业务 `/api`，不公开 `/opm-bootstrap.js`。

这是沿用共享 Runtime 的部署级访问模型，不代表多租户/模型级权限。接入凭证由部署/宿主认证体系发放，可以通过组件异步 accessToken 提供函数取得；AI 提供商密钥始终只配置在助手服务端。

错误沿用 v1 `error` envelope：LOCAL_SESSION_INVALID=403，INVALID_ARGUMENT=400，NOT_FOUND=404，PERSISTENCE_FAILED=500；原草稿 v2 错误格式不变。
