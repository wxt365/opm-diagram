# 工作台地址与宿主资源关联

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

执行：change / L3 / feature / none (primary)。repo-profile、task-types 与 playbooks 未提供。

## 目标与非目标
组件传入 backendUrl、assistantUrl、source（systemId/宿主项目与模型 ID 和名称）即可初始化会话、确保资源关联并进入完整编辑；bound 返回 OPM projectId/modelId，宿主可持久化后通过 binding 再次打开。
支持本机、局域网 IP+端口、服务器 HTTPS 与同源路径前缀。保留原 services/context 接入和原应用行为。
不重写语义规则，不发布注册表，不实现多租户用户/角色系统，不在浏览器模拟服务器代理。

## 范围与契约
允许：apps/web 组件、实例客户端/API 工厂、SDK/示例/打包；services/local-runtime API/应用编排/存储查询及配置、相关测试；apps/assistant HTTP/Runtime 客户端与测试；docs/contracts 的新增嵌入接口文档、docs/integration、docs/specs；相关浏览器测试。
禁止：数据库 schema/迁移、Profile 资产、依赖/锁文件、无关改动、.harness。已有幂等表保存稳定宿主关联，不新增 schema。
新增 JSON session、workspace ensure API，source 与 binding 结构分离，systemId 默认 default。source 名称仅为展示和首次资源命名，不触发重建/后端重命名。显式 binding 缺失资源报错，不自动重建。
后端关联键为 systemId+外部项目ID，模型追加外部模型ID；哈希使用无歧义 JSON 数组。创建成功但响应丢失可恢复；归档/删除关联报错，不静默新建。同一服务进程对 ensure 串行化，使用现有创建事务与幂等结果。
远程接入默认关闭，显式启用配置并设置精确来源 allowlist；远程 JSON 会话要求部署接入凭证，组件 accessToken 支持字符串或异步提供函数；不嵌入服务端 AI 密钥。配置一次后宿主不需要前端代理。会话凭证实例独立，不污染 window 全局。HTTPS 页面不允许直接 HTTP 后端。
版本为 0.2.0，安装包与原 0.1.x 并存。

## 验收
- A1：首次 source 解析到真实 OPM 项目/模型；并发、名称变化、响应丢失重试和服务重启不重复创建；同项目不同模型复用项目，不同 systemId 隔离。
- A2：binding 直接打开，未找到/归档明确报错；宿主 UUID 不受 OPM StableId 限制。
- A3：地址模式组件自动 session/ensure/加载，bound 输出一次身份关联；替换地址/身份忽略迟到响应；名称更新不重建；原 services/context 保持兼容。
- A4：每实例 Runtime/助手会话与地址独立，支持绝对地址及路径前缀、草稿原始提交字节不被改写。
- A5：远程模式的 CORS/preflight、合法会话/接入凭证、非法 Host/Origin/凭证拒绝，默认本机防护仍通过；助手支持远程浏览器调用与正确 SSE 终止。
- A6：定向后扩大回归、类型/lint、应用/库构建；真实浏览器跨源连接后端、首次创建/恢复/binding 打开及编辑保存验证；生成 0.2.0 包。

## 验证与回滚
Vitest、Java 21 Maven 定向集成/应用/防护测试、Node 助手 HTTP 测试、Playwright。受环境影响的项记录实际原因，未执行不算通过。
回滚关联客户端/API/远程配置并安装 0.1.1，已有模型继续可从原项目库打开；幂等记录为已有结构无数据迁移。
