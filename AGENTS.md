## 1. 文档定位

本文件是仓库级基线规则，默认始终生效。

本仓库采用两层入口：

- 本项目为代码仓库，本项目的需求、设计文档所在位置为`docs`,开发时遵循设计文档。
- 根目录只保留统一入口：`AGENTS.md`、`README.md`
- 项目规则资产统一收敛到 `.harness/`

`.harness/` 内的内容包括：

- `.harness/repo-profile.md`：具体仓库的目录、命令、边界、例外
- `.harness/routing.md`：`AGENTS`、`task-types`、`playbooks` 的职责边界和触发方式
- `.harness/task-types/*.md`：任务类型规则
- `.harness/playbooks/*/PLAYBOOK.md`：项目级技术栈规则或稳定交付方法规则
- `.harness/templates/*`：模板文件
- `.harness/docs/*`：运行说明、接入文档、失败回流记录

本文件不承载具体技术栈实现细节，也不承载特定任务类型的附加流程。技术栈规则和稳定交付方法规则应下沉到 `.harness/playbooks/*/PLAYBOOK.md`，任务类型规则应下沉到 `.harness/task-types/*.md`。

### 1.1 规则分层与优先级

本模板建议按以下层次组织约束：

- `AGENTS.md`：仓库级硬规则，始终生效
- 当前任务规格文档：当前任务的目标、范围、非目标、验收、回滚
- - `.harness`：在没有明确说明时不要该文件夹或下面的文件中增加内容。
- `.harness/repo-profile.md`：具体仓库的目录映射、标准命令、权限边界、模块说明
- `.harness/task-types/*.md`：任务类型规则，例如 `bugfix / feature / refactor`
- `.harness/playbooks/*/PLAYBOOK.md`：技术栈执行规则或稳定交付方法规则，按任务触发

规则优先级如下：

- 流程硬规则以 `AGENTS.md` 为准
- 当前任务边界以当前任务规格文档为准
- 仓库事实，例如目录、命令、工具链、发布方式，以 `.harness/repo-profile.md` 为准
- `task-type` 只提供任务类型附加约束，不能放宽前三者
- `playbook` 只提供技术栈执行指导或稳定交付方法指导，不能放宽前三者
- 如果 `task-type` 和 `playbook` 同时生效，按更严格者执行

当前任务规格文档的位置以项目既有规范或 `.harness/repo-profile.md` 为准。
如果项目没有既有规范，默认使用 `specs/`。

具体 `Task Type`、playbook 清单和触发方式见 [.harness/routing.md](./.harness/routing.md)。

---

## 2. 强制执行规则（MUST FOLLOW）

以下规则为强约束，不得跳过。

### 2.1 Task Type 与 Playbook 声明

- 每个任务必须声明 1 个 `Task Type`
- 当前模板内置的 `Task Type` 只有：`bugfix`、`feature`、`refactor`
- `Task Type` 必须写入当前任务规格文档，并在 Plan 阶段再次声明
- 如果存在对应的 `.harness/task-types/*.md` 文件，必须同时遵守其中的附加约束
- `Task Type` 不计入 `Active Playbooks` 数量
- `migration` 不作为 `Task Type`；如果任务涉及 schema、索引、回填、迁移脚本，应在对应 `Task Type` 基础上追加 `db-migration` playbook
- 每个任务在 Plan 阶段必须声明 `Active Playbooks`
- 必须指定 1 个 `primary playbook`
- 原则上不超过 3 个；超过 3 个必须说明原因
- 如果任务目标是补齐模块设计、页面设计、原型验收、前端 handoff 或开发执行包，默认必须启用 `design-module-docs` playbook
- 如果没有匹配技术栈 playbook，允许声明 `none (primary)`，并说明这是仓库治理或文档任务
- 未声明 `Task Type` 或 `Active Playbooks`，不允许进入 Build 阶段

输出格式示例：

```text
Task Type:
- bugfix

Active Playbooks:
- backend-springboot (primary)
- testing
```

### 2.2 阶段控制

任务必须按以下顺序执行：

`当前任务规格文档 -> plan -> checklist -> build -> verify -> summary`

说明：

- checklist 可以是独立文件，也可以是 Plan 阶段显式输出的任务清单
- 无论采用哪种形式，checklist 都必须包含 `Spec Mapping`，明确当前任务规格文档与目标、范围、非目标、约束、验收标准、验证方式、回滚方案的对应关系
- Plan 阶段必须先完成边界确认，再进入 Build

禁止：

- 跳过当前任务规格文档直接 Build
- 未生成 checklist 直接修改代码
- 未验证直接结束任务

### 2.3 修改边界

每次任务必须明确：

- 允许修改目录
- 禁止修改目录
- 是否允许修改 schema / API / 配置 / 文档 / 测试

如果当前任务规格文档或 `.harness/repo-profile.md` 未明确允许，默认禁止：

- 修改数据库 schema
- 修改公共 API
- 引入新依赖
- 大范围重构

### 2.4 验证强制

- 代码改动必须优先执行自动化验证
- 至少完成以下之一：单元测试、集成测试、明确手工验证步骤
- 如果无法执行自动化验证，必须说明原因和替代验证方式
- 文档类任务可不执行测试，但必须明确说明无需测试

禁止：

- 声称“理论可行”但未验证
- 在没有说明的情况下跳过验证
- 伪造验证结果

### 2.5 输出强制

每次任务必须输出：

1. `Active Playbooks`
2. `Task Type`
3. 修改文件列表
4. 验证结果
5. 风险与遗留项
6. 明确区分“事实”和“推测/假设”

---

## 3. 仓库级基线约束

### 3.1 小步修改

一次只处理一个明确任务。
禁止在单次任务中混入以下内容：

- 无关重构
- 顺手修复其他问题
- 擅自升级依赖
- 大范围格式化
- 无必要的命名迁移

### 3.2 架构与实现边界

必须遵循以下边界：

- 表现层不得直接访问持久层
- 控制层不得承载核心业务规则
- 公共模块不得依赖业务私有模块
- 新增依赖必须说明理由
- 禁止跨模块复制逻辑，优先抽象复用

实现时还必须满足：

- 保持与现有代码风格一致
- 优先最小改动
- 命名清晰
- 多种合理解释并存时，不得静默选择，必须显式说明假设和取舍
- 不引入无意义抽象
- 不为单次使用代码引入预留式抽象、预留式配置化或扩展点
- 只清理由本次改动造成的废代码；已有死代码如与任务无关，只记录不顺手删除
- 不添加无用注释
- 错误处理必须明确
- 计划中的关键步骤应尽量附带验证检查

### 3.3 复用优先

修改前先检查：

- 是否已有类似实现
- 是否已有公共工具函数
- 是否已有通用组件、服务、中间件
- 是否已有测试模式可复用

禁止重复造轮子。

### 3.4 文档同步

以下情况必须更新文档：

- 新增接口
- 修改配置项
- 调整模块职责
- 引入新的运行方式
- 调整测试策略
- 增加已知限制或风险

### 3.5 遇到不确定时的处理规则

如遇以下情况，先停止大范围实现，先做分析：

- 需求边界不清
- 架构冲突
- 找不到明确修改入口
- 测试失败原因不明
- 现有实现与当前任务规格文档冲突

此时应先输出：

- 不确定点
- 可能方案
- 推荐方案
- 需要确认或进一步探索的内容

### 3.6 Failure 反馈机制

只记录 Harness 级失败，不记录一次性手误或已即时自我修正的小问题。

当出现以下情况时，必须记录到 `.harness/docs/agent-failures.md`：

- 修改越界
- 误用技术栈或误用 `Task Type`
- 忽略验证要求
- 误解当前任务规格文档，导致返工
- 同根因问题重复出现
- 因模板缺口导致的稳定性问题

每个 failure 记录至少必须包含：

- 场景
- 问题
- 影响
- 根因
- 立即修复
- Harness 改进
- 回流落点
- 状态

每个 failure 必须转化为以下之一：

- `AGENTS.md` 更新
- `.harness/task-types/*.md` 更新
- `.harness/playbooks/*/PLAYBOOK.md` 更新
- `.harness/templates/checklists/*` 补充
- `.harness/templates/specs/*` 补充
- `.harness/repo-profile.md` 补充
- 明确记录“本次不做规则变更”及原因

禁止只记录 failure，不落实回流动作或不说明不回流的原因。
