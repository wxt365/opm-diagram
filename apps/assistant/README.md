# 对话式建模助手

工作台左侧“智能助手”页签支持围绕当前 OPD 的多轮对话，与“OPD 导航”切换使用。助手默认宽度 360 像素，可拖动左侧分隔条调整；导航和助手分别保留本页宽度。折叠底部及右侧属性区仍可对话，切换左侧页签保留输入、当前会话和生成订阅。助手自主逐步生成整张图或整组修改，生成中自动在画布显示暂存结果；完成时统一校验，用户点击“确认整图修改”后一次提交。预览不写入原模型，停止或取消恢复原图。确认前续聊可继续修改未提交方案。支持对象、过程、对象/特征状态、关系、名称及位置修改。父子图按整个模型读取；共享身份修改影响其他图时阻断。跨图写入和自动细化尚未开放。

## 启动

要求 Node.js 22.22 或更高版本，先启动 Java Local Runtime 和 Web 工作台。

本机开发运行 Runtime 时，先把构建后的 JAR 复制到独立启动目录，再使用该副本启动；每次更新使用新目录。直接运行 Maven `target/` 下的 JAR 后再次构建，会替换运行进程仍需读取的资源，可能出现类加载失败、请求超时或 `PERSISTENCE_FAILED`。重启沿用原 `opm.storage.root`，升级前备份 SQLite；不要清空数据或手动删除恢复标记。前端开发服务会加载源码变更，Runtime 与助手仍须重启才能加载最新实现。

```sh
# 在仓库根目录执行；java 必须为 Java 21，存储路径填写已有目录。
runtime_launch_dir="$(mktemp -d /private/tmp/opm-runtime-launch.XXXXXX)"
cp services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar "$runtime_launch_dir/runtime.jar"
java -jar "$runtime_launch_dir/runtime.jar" --server.port=17850 --opm.storage.root=/absolute/path/to/existing-runtime-data
```

```sh
npm install
cp apps/assistant/.env.example apps/assistant/.env.local
# 在 .env.local 中配置 DEEPSEEK_API_KEY，保持文件仅本机可读。
chmod 600 apps/assistant/.env.local
npm run assistant:dev
```

默认模型 `deepseek-flash`，服务地址 `https://api.deepseek.com`；Harness 使用 DeepSeek Messages 兼容端点 `/anthropic`。固定 Harness 和 SDK 版本 `0.2.0-rc.2`，不自动换模型。

默认助手监听 `127.0.0.1:17860`，Runtime 为 `http://127.0.0.1:17850`。Vite 将 `/api/assistant` 代理到助手；`VITE_ASSISTANT_ORIGIN` 可改开发代理目标，服务配置见 `.env.example`。密钥不进入前端构建或返回值，也不写入 profile 文件。

仅支持本机工作台。静态生产前端需要同源代理 `/api/assistant`，并保留 Host、Origin 和 `X-OPM-Session` 请求头；本轮没有验证生产发布或多人部署。

## 会话、工具与恢复

一个项目对应一个 Harness 工作目录，一个 OPD 对应一个固定会话及持久 Harness session。打开助手自动恢复或创建该图会话，切图恢复对应历史；不再提供会话选择、新对话或常驻刷新，连接异常时显示“重新连接”。读取父子图不会复制语义身份；布局只修改当前 occurrence。第一版不提供把同一对话迁移到另一 OPD 的操作。

对话消息和方案报告分别滚动，已应用或取消的历史方案收纳在默认折叠的“历史方案与校验”中；当前待处理方案自动展开，高度受限，仍可查看报告及确认。主动发送成功后回到最新消息，后续手动上翻历史不被事件更新打断。这样展开旧报告也不会遮住连续追问的回复。验证见[回复可见性规格](../../specs/opm-assistant-followup-visibility-task-spec.md)。

助手回复支持常用 Markdown 子集：表格、标题、段落、简单列表与引用、粗体/强调、行内和围栏代码以及 HTTP(S) 链接。表格单元格自动换行，过宽表格和代码在消息内部滚动，不撑宽侧栏。用户问题继续显示原文，编辑不会丢失符号；历史回复使用同一渲染方式，无需重新生成。原始 HTML 与图片语法保持文本，不执行脚本或加载远程图片；复杂嵌套和其他未支持语法不声明完整 CommonMark/GFM 兼容。验证见[Markdown 显示规格](../../specs/opm-assistant-markdown-task-spec.md)。

`list` 返回唯一会话，兼容的 `create` 接口幂等返回相同身份；同项目/模型/OPD 并发获取串行执行。文件以可选 `primary` 标记固定绑定，重启保持身份。旧多会话优先沿用包含运行中/中断生成或待核对提交的一条，其次最近有内容的一条；其余旧文件完整保留，不合并 Harness 历史或重定向提案。正常历史的更新时间不会因服务启动而重写。规则及验证见[唯一会话规格](../../specs/opm-assistant-single-session-task-spec.md)。

消息身份使用独立图标栏。用户问题右上角铅笔可回填原文，修改后点击“发送更正”，在同一会话追加明确的纠正消息；原历史保留，已应用的模型修改不会自动撤销。取消编辑恢复原输入草稿，发送失败保留更正以便重试；生成中、提交中或只读时不可编辑。验证见[问题更正规格](../../specs/opm-assistant-message-edit-task-spec.md)。

建模 agent 仅开放 `read_model`、`get_capabilities`、`stage_change`、最终修正专用的 `revise_plan` 和兼容旧单步的 `propose_change`。独立审查 session 仅开放 `read_review_model` 和 `submit_review`，服务端同时阻止审查会话写入及审查期间的建模操作。模型不能调用 shell、文件写入或直接提交模型。每项目同时只允许一个生成，180 秒到期停止；每轮最多 160 次工具调用、100 项方案步骤。停止关闭本项目 Harness，未完成方案取消且不能确认；已应用命令不会回滚。

数据默认在已忽略的 `runtime-data/assistant/`：`conversations/` 保存业务历史和提案，`workspaces/<projectId>/.dsh/` 保存 Harness 会话。停止或重启后通过 SDK 适配调用 `agents.resume`，重新读取当前模型。重启中断的生成标记为中断，可以续聊。删除 OPD 后仍可读取原对话记录，生成及应用由 Runtime 拒绝，不自动改变会话焦点。

HTTP 业务接口均为 POST JSON，使用本地工作台 Origin 和 `X-OPM-Session` 验证；OPD scope 为 `projectId/modelId/contextId`，对话操作还需 `conversationId`。接口：`list/create/get/prompt/watch/stop/cancel/apply/convert`。生成和应用必须提供当前 `draftToken`；历史版本面板禁用写操作。`watch` 为 POST SSE，浏览器断开仅停止订阅，后台任务可继续。

提案绑定基础 token、候选授权、图范围及固定 command ID。应用时重读完整模型和候选，每模型串行提交，冲突使旧提案失效。结果未知保留 pending，并优先查询原 command ID 的回执；重复应用已成功提案直接返回记录。`stage_change` 使用高层步骤及 local_id 别名，由 Runtime 绑定现有候选并在副本中重演，通过 SSE 返回投影。图元身份在生成、续聊及提交之间保持稳定。完成后再次校验整组方案，失败或截断不能确认半张图；非法步骤修正后才可完成。确认走 `APPLY_MODEL_PLAN`，所有步骤在一个 Journal 事务提交，只增加一次 edit_seq；后续步骤非法或 token 冲突时零部分写入。旧单步提案继续兼容。契约和验证见[实时整图规格](../../specs/opm-assistant-live-plan-task-spec.md)。

## 脑图分析与单 OPD 转换

工作台中央“脑图分析”提供模型级分析画布，支持键盘新增、改名、拖动父级、折叠、搜索、平移缩放、撤销/重做、700ms 自动保存和手动保存。分析内容与正式模型独立修订，保存脑图不增加模型 edit_seq，也不生成 OPL。JSON 通过 `{format: "opm-mindmap", version: 1, document}` 单独交换；导入重建节点/关系 ID 和内部引用，解除外部正式绑定，保留目标模型的 mindmap ID/修订。现有模型和 OPD 交换包不包含脑图。

一个模型对应一个固定 ANALYSIS 会话，scope 增加 `kind: "ANALYSIS"` 与 `mindmapId`；contextId 只表示当前或目标 OPD，切图不更换分析会话。共用项目 Harness 工作区，SDK session 为 `analysis.<conversationId>`，与 OPD 及 `review.<ID>` 审查 session 隔离。分析模型只可调用 `read_analysis/save_analysis`，按完整文档 CAS 保存，不能调用建模、提交或审查工具。读取工具提供精简字段契约和引用说明，错误返回字段路径或语义引用诊断，供模型修正。

左侧分析助手的“根据脑图生成 OPD 预览”和脑图详情的“生成 OPD 预览”共用入口，沿用详情中的目标 OPD 与明确排除选择，无须新建 OPD 或另开会话；空正式模型及 target_id=null 属于首次转换的正常情况。阻断项集中显示准确原因，可定位和明确排除，原文保留在脑图；属性首版不支持转换，不能提示成类型未明确。连接错误显示重连，转换业务错误显示具体原因。

明确排除的 ID、标签和目标 OPD 同时写入独立语义审查的需求范围，保留在分析中的排除内容不应被误判成模型需求遗漏。审查截断或未提交有效结构化报告仍阻断确认，不以平台检查通过替代语义审查。

专用 Harness 关闭默认 spill-policy：该策略会截掉较大工具结果的中段，并要求读取临时文件；本助手的受限会话没有文件工具，无法按此恢复。OPM 工具结果完整传递，继续受应用的输入规模和步骤上限约束，审查工具仍只读。审查先提交完整结构化报告，再简短回复，避免长篇说明占满输出额度。发生输出长度限制时显示具体原因并保留已完成的平台诊断，仍禁止确认；不会自动重复审查或把截断当成通过。

点击生成前保存分析，通过 `convert` 接口显式绑定一个目标 context 和 `excludedIds`。类型和关系确定后编译稳定来源步骤，逐步使用 Runtime 投影绘制；平台 Findings 和独立标准审查完成后一次确认。主题不生成元素；状态归属使用 owner_id，同实体重复引用使用 entity_ref，同名不合并。属性、约束、未分类或未明确的关系阻断转换，用户须补齐或明确排除。转换的标准审查发现问题时先自动修正预览并协调来源；无法修正时保留预览和诊断，业务含义需补充时才核对脑图。

Runtime `POST /api/v2/projects/{project}/models/{model}/draft/mindmap` 提供 OPEN/SAVE，SAVE 检查 DraftToken、mindmap ID 与 expected_revision。确认 APPLY_MODEL_PLAN 时，同时检查来源修订/摘要并持久化正式模型、完整分析快照、来源映射、排除项与回执。SQLite V8 新增 mindmap_document/mindmap_conversion，迁移前保留一致备份；原 V7 库可受控升级，迁移文件不改写旧版本。

已确认来源可从画布定位；重复转换无变化时不创建提案，增量支持新增及改名。脑图未改名时保留模型手工改名，双方均改名时报冲突。原绑定丢失、类型/归属改变、既有关系端点或能力改变时阻断，要求在正式模型核对处理。删除脑图节点不删除模型元素。刷新恢复已确认转换的明确排除项，停止或取消不提交模型；响应未知先恢复原 command ID 的回执。

当前上限：300 节点、100 关系、100 项正式修改；助手 document_json 最多 128000 字符，助手 HTTP 请求与脑图导入文件最多 256 KiB。输入上限不代表已经验证 300 节点性能。历史 Revision 禁用活动脑图入口，不提供历史脑图视图。自动父子图、多图事务、第三方格式和完整双向同步后置。支持选择已有子 OPD 作为单图目标，不开放跨图共享身份写入。

在独立 Runtime/助手/前端及独立存储上执行：

```sh
OPM_E2E_EXTERNAL_SERVERS=true npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/workbench-mindmap.spec.ts --grep '真实脑图编辑' --output=/private/tmp/opm-mindmap-ui-e2e
OPM_E2E_EXTERNAL_SERVERS=true OPM_MINDMAP_LIVE=true npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/workbench-mindmap.spec.ts --grep '真实 DeepSeek' --output=/private/tmp/opm-mindmap-live-e2e
```

主流程成功后，停止并重启独立助手，再使用生成的 mindmap-live-proof.json 检查同一分析会话恢复、增量确认及安全边界：

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_MINDMAP_RESUME_PROOF=/absolute/path/to/mindmap-live-proof.json \
  npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-mindmap.spec.ts \
  --grep '重启后分析续聊' --output=/private/tmp/opm-mindmap-resume-e2e
```

测试自行新建隔离项目，不要指向用户日常数据。脑图资料在 Runtime SQLite，聊天/Harness 在助手存储，两者需共同备份。功能回滚应保留 V8 migration/resources 与数据，不降级/删除表；旧二进制是否接受数据库 future version 未验证。物理恢复需停止服务后使用迁移前备份，并明确会丢失备份后修改。实际范围与验证记录见[脑图实施规格](../../specs/opm-mindmap-implementation-task-spec.md)。

## 生成指导与建模质量建议

[生成指导 Skill](skills/opm-modeling-guide/SKILL.md) 在每轮建模及自动修正时固定注入，包括业务目标、概念复用、对象/过程/状态选择、关系构建顺序与布局方法。已有会话的续聊同样加载当前指导。独立标准审查不注入生成指导，继续使用自己的只读规则与报告 schema。只读解释和结构清单任务遵循用户目标，不强制添加过程或关系；父子图读取不扩大跨图写入权限。

`read_model` 返回 [质量策略](skills/opm-modeling-guide/references/quality-policy.json)。当前默认建议每图不超过约 12 个节点（包含对象、过程、属性和状态），顶层对象/过程间距至少 24 像素，关系端点跨度不超过 640 像素。维护者可调整服务端策略文件并更新策略版本后重启助手；模型不能通过对话改写策略或权限。阈值是阅读偏好，不是 ISO 阻断规则，不要求模型细化到固定层数。

最终预览附带可选 `quality` 报告，依据当前图投影检查占位名称、同类型同名的不同语义身份、未显示常见变换关系的过程、节点密度、布局间距和端点跨度。正常包含在对象里的状态/属性不作为顶层重叠。名称检查只对规范化后的精确同名提示，不按近义词自动合并；合法的多条事实和状态限定也不按端点重复判错。跨度计算是端点距离提示，未测量完整路由、交叉线或字体布局。

报告绑定方案摘要、指导/策略版本及内容摘要，在提案中以“建模质量”折叠显示，与平台和标准报告分开。最多展示 50 条建议，超过部分显示数量。建议均为 WARNING，不参与确认门槛、不触发额外自动修正；用户有意指定同名、重叠或密集布局时保留。严重语义问题仍由平台和标准审查阻断。方案修改后清除旧质量报告，再最终计算；报告随提案保存，刷新及重启恢复。旧历史没有 quality 字段仍兼容，不增加确认步骤。

范围和真实验证记录见[生成质量规格](../../specs/opm-assistant-generation-quality-task-spec.md)。

## 最终诊断与标准审查

整图完成后先调用 Runtime 现有模型级 Findings，覆盖整份模型并复用问题面板的规则。`plan-preview` 的可选 `finalize=true` 返回 `findings`；普通实时预览返回 null。确认事务重新计算 Findings，存在阻断项时全部步骤零写入，避免仅靠生成前检查放行。

平台无阻断后，使用同一 DeepSeek 模型的独立只读 Harness session 审查冻结投影、用户需求和未提交步骤。随服务发布的 [Skill](skills/opm-standard-review/SKILL.md) 及 [规则目录](skills/opm-standard-review/references/rules.json) 来自本地 `reference/ISO+19450-2024.pdf` 原文核对，固定版本 1.0.0，仅覆盖对象/过程、状态归属、变换、状态变化、使能及图间事实一致性六组条款，不分发标准全文。

结构化报告包含六项检查、条款、图范围、图元、修正建议和业务假设；来源、版本、方案与快照摘要由服务端绑定和核验。业务需求遗漏使用 USER_REQUIREMENT，不能冒充标准条款。模型语义错误及明确需求遗漏阻断确认，警告与假设保留供用户查看。调用失败、截断、未提交有效报告或报告过期均不能标记通过。报告折叠显示在提案中，保存、刷新和服务重启后保留。

发现平台阻断或标准语义错误时，建模会话自动修正暂存方案，再执行全套检查，最多修正两轮。仍失败时展示诊断，允许继续对话或取消，不能提交。修正工具仅能替换未提交步骤，不能删除真实模型或扩大跨图权限。180 秒期限覆盖生成、审查和修正全过程，任何阶段均可停止。旧整图方案缺少报告时需要继续对话重新生成；旧单步及待核对回执沿用兼容规则。详见[审查任务规格与验证记录](../../specs/opm-assistant-validation-review-task-spec.md)。

这些结果代表平台当前规则与已列明条款的部分语义审查。大模型判断仍可能遗漏或误判，不能作为完整 ISO 符合性或业务专家认可的证明。

脑图转换失败时，最新阻断报告自动展开，画布保留“待修正预览”，确认仍禁用。“重新生成并修正预览”复用转换入口；“核对并补充脑图说明”仅填入可编辑分析请求，不自动发送。分析助手的 `read_analysis` 会返回最新同脑图版本、同模型版本的转换诊断及定版端点和来源绑定，先核对事实再修正；版本改变或有更新方案时不沿用旧报告。需要业务判断时询问用户，补充脑图后重新生成预览，正式模型仍须最后确认。

脑图转换中的平台/语义冲突现在也先进入最多两轮自动修正：助手直接更新未提交的 OPM 预览，重新完成平台检查与独立审查，再由用户一次确认。此阶段冻结原转换步骤和来源，可以移除冲突项、取消未执行更新、恢复前轮误删的原步骤或调整布局；不能新增分析外元素、改名、改类型、改变状态归属或重写关系定义。每轮按原方案子集重新协调来源绑定和当前未纳入项，恢复后不再列为已移除。用户明确排除项不恢复；后续审查核对移除是否合理，不把自动移除冒称用户明确排除。无法在此范围内修正或两轮后仍失败时保留预览、诊断和取消入口。确认前不写正式模型。

## 验证

```sh
npm run assistant:test
npm run typecheck
npm run lint
npm run test --workspace=@opm/web
```

真实模型和画布验证需要另建隔离项目，准备 JSON 文件，至少含 `projectId`。测试会在该项目中新建模型，保留验证结果供检查，不使用现有模型。

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/absolute/path/to/isolated-project.json \
  npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-live-plan.spec.ts --grep '一次需求' \
  --output=/private/tmp/opm-assistant-live-plan-e2e
```

实时整图用例输出 `assistant-scope.json` 及生成中/完成/窄屏截图，不含会话凭据。停止并重启助手后，可用该文件验证同一会话恢复：

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_LIVE_RESUME_PROOF=/absolute/path/to/assistant-scope.json \
  npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-live-plan.spec.ts \
    --grep '服务重启后' --output=/private/tmp/opm-assistant-live-plan-resume-e2e
```

原七轮兼容用例 `workbench-assistant.spec.ts` 仍保留；下述旧安全用例需要该七轮用例的输出，不能直接使用实时整图用例的输出。停止并重启助手服务后，可将该文件用于恢复与安全用例：

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_RESUME_PROOF=/absolute/path/to/assistant-scope.json \
  npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-safety.spec.ts \
    --output=/private/tmp/opm-assistant-safety
```

安全用例会在隔离模型中手工添加对象和细化子图，需要主用例刚生成的七提案模型；重复执行整组安全用例前重新跑主用例，不能复用已修改的旧数据。停止用例可单独通过 `--grep '真实运行停止'` 执行。输出目录应与身份文件所在目录不同，避免 Playwright 清理输入文件。

真实调用会产生供应商费用。实时整图浏览器用例验证一次需求生成多元素及投入产出关系、生成期间画布可见、平台 Findings 与六项标准审查、确认前续聊重新审查、一次确认、预览/取消零写入和保存重开；旧用例保留七轮及状态变化关系验证。故障注入测试覆盖冲突、取消、越界、重复应用及丢失响应恢复；这不代表已在真实供应商网络中重现所有故障，也不代表完整 ISO 符合性。

标准审查故障用例使用隔离模型与临时助手数据根。驱动仅在首次生成注入“磨豆活动错误建成对象”的预览，其后审查与自动修正全部使用真实 DeepSeek，不修改主助手历史。用例检查首份报告识别语义错误、最多两轮修正、重新审查、确认前零写入和最终一次提交后的真实画布。

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/absolute/path/to/isolated-project.json \
  npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-review.spec.ts \
  --output=/private/tmp/opm-assistant-review-repair-e2e
```

原文页图核对与本轮测试结果详见[审查验证记录](../../specs/opm-assistant-validation-review-task-spec.md)。

真实生成指导与质量建议验证：

```sh
OPM_E2E_EXTERNAL_SERVERS=true OPM_ASSISTANT_PROOF=/absolute/path/to/isolated-project.json \
  npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-assistant-live-plan.spec.ts \
    tests/e2e/workbench-assistant-quality.spec.ts --grep '一次需求|真实助手保留' \
    --output=/private/tmp/opm-assistant-generation-quality-e2e
```

质量用例有意要求两个不同设备同名和指定的重叠坐标；验证建议可见但不阻断确认、身份不被合并、一次提交和保存恢复。所有用例均在独立测试项目创建新模型，不修改用户已有模型。
