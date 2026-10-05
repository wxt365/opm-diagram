# ML-OPD-01 多层 OPD 建模

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：none (primary)。

状态：边界已确认，实施中。用户以“下一步”授权本规格所需的版本化公共契约变更。仓库当前没有 `.harness/`，不创建该目录。上游已交付多 Context OPL/Trace 与整模型保存，但尚无子图创建、细化关系或树形导航。

## 1. 目标与非目标

从当前 OPD 中选中的 Object 或 Process 创建子 OPD，保存显式且稳定的 RefinementEdge；可以进入子图继续建模、返回父图，通过 process tree/object forest 定位任意层级。保存后重开、固定历史版本与多 Context OPL/Trace 保持一致。空子图允许保存。

本轮不实现模型交换、完整规则校验、发布验证、Context 删除、跨图引用编辑、通用 ViewDefinition、Profile Context 或旧模型批量迁移。页面的画布缩放仍是视图缩放，语义细化是独立命令。

## 2. 边界与契约

允许 `specs/` 中本规格、`docs/checklists/` 中本任务 Checklist、必要的 `docs/design/` 同步、`scripts/` 中当前两份契约生成器、`docs/contracts/` 对应新版本 Schema/OpenAPI、`services/local-runtime/src/{main,test}/` 中语义、草稿、存储和定向测试、`apps/web/src/` 工作台和生成类型、`tests/e2e/` 的定向浏览器测试。允许版本化公共 API/JSON Schema、生成代码、文档和测试；不允许 SQLite 表结构、配置或依赖变更。

禁止修改 `.harness/`、SQLite 表结构或旧迁移、依赖与运行配置、既有 Profile/Golden/发布工件、用户数据库及范围外文件。旧 `opm-revision-v0.2.schema.json` 与 SaveContentDigest/1 的字节和既有摘要公式不改；新持久语义必须用独立的版本化内容契约，不能藏入 provenance、展示字段或未校验元数据。

新 Revision 0.3 / SaveContentDigest/2 契约至少需要：Context 与 RefinementEdge 的身份、父 Context、被细化 Element 和细化种类；`CREATE_CONTEXT` 草稿 payload 与候选授权；导航节点的父子定位信息。旧无细化边的 Revision/SaveContent 继续按旧版本读取并保持摘要。新版本的保存、Journal 回放、历史读取和固定版本查询必须按记录的契约/摘要版本选择校验，不静默重算旧摘要。不得通过降级读写丢失新字段。

## 3. 行为约束

- 仅当前 Context 内有 OWNED occurrence 的 Object/Process 可细化；Context kind 分别为 `OBJECT_REFINEMENT`/`PROCESS_REFINEMENT`。提交时一次创建 Context 和 RefinementEdge，失败不留孤立 Context。
- 每个子 Context 恰有一个父边，根 Context 无父边；拒绝重复子图身份、悬空端点、错误类型、跨模型引用与环。允许同一父图的不同 Element 分别细化，并允许继续细化子图中的 Element。
- 创建后打开新子图；返回操作使用持久化父边，不从名称、数组顺序或路由猜父图。导航投影在两棵树中保留所有节点和当前路径，稳定排序，并与固定历史版本一致。
- 旧草稿仍可编辑和保存；需要升级为新契约时，必须有受测试的原子升级路径及失败回滚。原有根图文本身份与旧历史内容不变；新增子图的文本/Trace 按现有多 Context 规则生成。
- 非根 Context 里的创建、名称编辑、布局编辑及关系建模沿用现有授权与范围校验；跨图删除或影响不明确的命令继续阻断。

## 4. 验收与验证

- ML-01：Object/Process 在根图和子图创建多层子 OPD；非法选择、过期授权与重复提交均明确拒绝或幂等，Context/RefinementEdge 原子产生。
- ML-02：每层导航的父子关系、当前路径与返回父图正确；刷新、链接和固定历史版本定位正确；旧单图模型行为不变。
- ML-03：子图可添加节点/关系、生成 OPL/Trace；保存、重开与历史查询保留全部层级，旧内容摘要及根图文本身份不变；损坏边或失败保存零部分写入。
- ML-04：定向 Java/Node/Web 测试、Schema 生成检查、类型检查及浏览器桌面/窄屏流程通过；记录实际执行结果，未运行项明确说明。

Plan：先确认公共契约范围和版本方案，再实现语义关系与校验、版本化存储及命令授权，然后接导航和工作台，最后按 ML-01 至 ML-04 逐层验证。Checklist 仅引用本规格和验收 ID，不复制正文。

回滚：撤销本任务增量代码和新契约；保留已产生的新版本数据，不用旧程序覆盖或重写它。若新数据已经写入，回滚运行版本须先具备对应读取能力或停写，不做数据删除。
