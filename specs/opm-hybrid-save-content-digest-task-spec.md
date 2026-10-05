# HS-01B 保存内容摘要与无损拆分

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、testing。

状态：设计冻结，实现及定向验证完成。上游：[混合保存实施任务](opm-hybrid-save-strategy-implementation-task-spec.md)。

## 1. 目标与非目标

实现 SaveContentDigest/1 的封闭内容域、Node/Java canonical bytes 与摘要一致性、Revision 到内容和元数据的无损拆分/还原，为无变化保存判定及迁移等价检查提供基础。禁止经 SemanticRevisionReader/Writer 中转：该类型尚不保留 model_header 描述、route_points、essence 等全部持久字段。

不实现 HTTP 草稿编辑、保存协调器、数据库模式切换或前端按钮。不修改用户数据库、SQL、旧 Revision Schema、历史工件、Profile bytes 和既有 JCS 行为。不以相同摘要替代模型领域校验或 OPL/Trace 完整性验证。

## 2. 唯一契约

输入为已解析的 MS-REV-001/0.2 原始 JSON 对象；不接受 0.1 或 DOM/Projection/语义 DTO。调用方负责原始 bytes 的严格 JSON 读取、重复键拒绝及来源/领域验证。Java 另提供严格 read(String) 入口，禁止重复键与尾随输入。Schema owner 由 `generate-save-content-contract.mjs` 从当前 `opm-revision-v0.2.schema.json` 的完整字段域生成，生成物独立版本为 SaveContentDigest/1。

输入 Schema 保留原 schema 的全部字段约束，但 schema_set_ref、text_artifact、validation_summary、revision_digest 不作为必填，model_header.name 不作为必填，以接纳现有 Runtime 文档及 SemanticRevisionJsonWriter 输出；不填补缺失数据、不将缺失与空字符串/空数组合并。该兼容仅影响本摘要输入，不更改原 MS-REV 验收规则。输入模型 ID 必须等于 model_header.model_id。

内容字段完整集合：model_id、profile_binding、model_header、elements、features、states、facts、contexts、occurrences、layouts、state_presentations。除 features、state_presentations 外必填。内层字段沿用原 schema，包括业务名称/描述、全部 Context、引用、State presentation、essence/affiliation/perseverance、normalization 和 route_points。未知字段或缺失必填字段拒绝；新增持久字段须升级摘要契约，不能静默忽略。

仅以下顶层字段进入独立 metadata：schema_id、schema_version、revision_id、parent_revision_id、revision_sequence、schema_set_ref、text_artifact、text_traces、validation_summary、revision_digest。不递归删除同名字段。时间、操作日志、视口不在输入 Schema 中，误塞入时拒绝；SQLite created_at 不进入此 JSON。文本/Trace/校验报告完整保存在 metadata 中，由后继服务独立验证，不进入内容去重摘要。

preimage 精确为 `{schema_id:"OPM-SAVE-CONTENT-DIGEST",schema_version:"1",float_encoding:"IEEE754_BINARY64_BE_HEX",content:<normalized content>}`。仅 layouts[].x/y/width/height 及 layouts[].route_points[].x/y 转为 `{"$binary64":"<16 lowercase hex>"}`。复用 ProjectionDigestV01 的 binary64Hex owner，以公开纯函数形式提供（先拒绝非有限数）；保留正负零区别，无容差/舍入。其他数字为安全整数，整数形状的 1.0 与 1 等价；不接受 numeric string。字符串按 Unicode scalar 原样保存、不做 NFC；孤立 surrogate 拒绝。对象 key 由既有 JCS 排序，所有数组保持输入顺序，所有可选字段保持存在性。

`digest = SHA256(UTF8(existing JCS(preimage)))`。无换行、无 BOM、小写 hex。Node 导出 splitRevisionV1、joinRevisionV1、buildSaveContentPreimageV1、canonicalBytesSaveContentV1、sha256SaveContentV1；Java SaveContentDigestV1 提供 split、join、preimage、canonicalBytes、sha256 和 read。split 返回 content/metadata 两个全新深拷贝；join 拒绝 metadata 覆盖 content，重新验证拼接文档。仅承诺 JSON 值和所有字段/顺序无损，不承诺 whitespace/raw bytes 相同；迁移必须另存原始 bytes/hash。

固定错误码：SAVE_CONTENT_INPUT_INVALID（形状/版本/类型/缺失/多余/边界/模型身份）、SAVE_CONTENT_UNICODE_INVALID、SAVE_CONTENT_NON_FINITE_FLOAT、SAVE_CONTENT_NUMBER_DOMAIN_INVALID（非几何 unsafe/fraction）、SAVE_CONTENT_CANONICALIZATION_FAILED。先检查 JSON 值域（Unicode、非有限数、非几何数字），按 UTF-16 key 顺序深度优先确定首错；再按 Schema required 顺序/属性 key 顺序检查结构；model ID join 最后。错误携带 code 与 jsonPointer；所有失败零存储写入。摘要服务不负责生成 HTTP ErrorEnvelope。

## 3. 精确允许范围

- 新增：`scripts/generate-save-content-contract.mjs`、`scripts/save-content-digest-v1.mjs`、`scripts/save-content-digest-v1.test.mjs`。
- 新增生成物：`docs/contracts/schemas/opm-save-content-v1.schema.json`、`services/local-runtime/src/main/resources/draftsave/save-content-v1.schema.json`。
- 新增：`services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java`、同包 `SaveContentSchemaV1.java`；`services/local-runtime/src/test/java/org/opm/localruntime/semantic/SaveContentDigestV1Test.java`。
- 新增：`tests/fixtures/hybrid-save/save-content-v1-vectors.json`（含完整输入、预期 preimage、canonical UTF8 hex、SHA 及错误向量）；`scripts/author-save-content-vectors.mjs` 为受控向量作者，测试不得调用其更新 expected。
- 最小修改：`scripts/canvas06-projection-digest-v01.mjs`、`services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ProjectionDigestV01.java`，只公开带非有限数保护的 binary64Hex，不改历史算法。
- 文档：本规格、保存设计、上游实施规格和实施 Checklist。

无新依赖；Java 内部 Schema 校验器仅支持本生成 Schema 的关键词，生成时拒绝未支持关键词，避免 Java 静默跳过新增规则。Node 使用现有 AJV，不修改共享 JCS。

## 4. 验收

- HS-B01：同一机器 Schema/资源生成 --check 通过；正反输入两端一致。
- HS-B02：同一固定向量两端逐项验证 preimage、canonical bytes、SHA；包含中文/emoji/非 NFC、空集合、正负零、小数、极限有限浮点、route_points。
- HS-B03：只改 Revision ID/序号/派生元数据摘要不变；名称/描述/绑定/布局/业务字段/数组次序/可选字段存在性变化摘要变化；不修改输入。
- HS-B04：缺字段、未知字段、版本、lone surrogate、NaN/Infinity、unsafe integer、非几何小数、错误 ID join、重复键/尾随输入（Java raw 入口）拒绝。
- HS-B05：真实现有 fixture 拆分还原全部 JSON 值一致，保留 reader 未建模字段；Projection/JCS 原测试通过。该测试不是数据库迁移证据。

## 5. 计划、验证与回滚

顺序：生成并冻结字段 Schema→实现两个 writer 和 split/join→固定独立 expected 向量→Node/Java 同向量与既有 owner 回归→文档记录。从已有真实 fixture 复制受控测试输入，不修改源 fixture。发现双端差异修正实现，不自动更新 expected。验证命令记录于 Checklist。回滚仅撤回本文件集合的增量，未接入生产读写，数据库无需回滚。

冻结输入 raw SHA-256：Revision Schema=`36cede0a2d7fbcf67e80415d3a7e9713e25cb6734032feb72cbf88d0f95f4fdc`；5 正向/20 负向向量文件=`ebb5b0a34dde5e06ba417bc43a1c19326be14dfed82abb23eee217739afd625c`。生成器拒绝源 Schema 漂移，两端测试锁定向量原始 bytes。Java 严格 raw reader 显式保留 `-0` 与 `-0.0` 的 binary64 符号位，与 Node parsed-number 语义一致。
