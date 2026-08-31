# DEV-CANVAS-06 Projection Digest Closure 设计

文档版本：`v1.1`

文档版本：`1.0`

设计状态：`FROZEN`

实现状态：`NOT_IMPLEMENTED`

契约版本：`0.1`

对应规格：`specs/opm-dev-canvas-06-projection-digest-closure-bugfix-task-spec.md`

## 1. 文档定位

本文是 DEV-CANVAS-06 Recovery 与 E2E 对正式 `API-CTX-002 GetContextProjection` data 计算稳定 SHA-256 的唯一设计 owner。它定义 Projection payload 到安全整数 JCS 值域之间的版本化适配层，不修改产品 Projection、共享 RFC 8785 owner或业务语义。

本文冻结未来实现输入，不表示 Node/Java normalizer、producer、verifier、Recovery `28/56`、E2E `194/388`或任何release evidence已经完成。

## 2. 已确认冲突与原则

当前事实：

1. `LocalApiService.projection(...).data` 固定返回 `{context_id,constructs[]}`；
2. `constructs[].layout.x/y/width/height` 来自 `SemanticRevision.Layout` 的 Java `double`；
3. `layout.z_order`与`endpoints[].ordinal`是整数；
4. `scripts/canvas06-rfc8785.mjs`和Java `Rfc8785JsonCanonicalizer`只接受safe integer，明确拒绝浮点；
5. Recovery Report `0.1`与E2E Attempt Artifact `0.1`已经分配Projection digest字段，但此前没有可执行浮点preimage。

唯一原则是：不放宽共享JCS值域，不使用默认小数字符串。Projection专用normalizer先把允许位置的有限binary64转换为纯字符串tagged value，再调用既有JCS owner。

## 3. 版本、Owner与计划实现接口

### 3.1 机器Owner

| 责任 | 唯一owner |
| --- | --- |
| preimage结构 | `docs/contracts/schemas/opm-dev-canvas-06-projection-digest-preimage.schema.json` |
| parity目录结构 | `docs/contracts/schemas/opm-dev-canvas-06-projection-digest-parity-vectors.schema.json` |
| exact正反输入 | `tests/e2e/release/dev-canvas-06/fixtures/projection-digest-v01-parity-vectors.json` |
| JCS Node owner | `scripts/canvas06-rfc8785.mjs` |
| JCS Java owner | `org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer` |
| Projection摘要语义 | 本文`v1.0`/契约`0.1` |

Markdown示例不覆盖Schema/vector原始bytes。三份机器输入的identity、payload/raw SHA以第10章为准。

### 3.2 计划实现接口

Node唯一计划模块：

```text
scripts/canvas06-projection-digest-v01.mjs
  buildProjectionDigestPreimageV01(projectionData) -> plain JSON object
  sha256ProjectionV01(projectionData) -> lowercase SHA-256
```

Java唯一计划类：

```text
org.opm.localruntime.releaseauthoring.ProjectionDigestV01
  preimage(Map<String,Object> projectionData) -> Map<String,Object>
  sha256(Map<String,Object> projectionData) -> String
```

两端只能调用各自现有共享JCS owner。禁止复制JCS、调用Jackson/`JSON.stringify`生成digest bytes或创建可选择的float strategy。Java类可以存在于Runtime releaseauthoring包供受控materializer/snapshot adapter复用，但不得暴露HTTP API、Spring bean、环境变量或产品配置开关。

## 4. Projection Digest `0.1` Preimage

### 4.1 顶层形状

```json
{
  "schema_id": "OPM-DEV-CANVAS-06-PROJECTION-DIGEST-PREIMAGE-001",
  "schema_version": "0.1",
  "source_projection_contract": "API-CTX-002/0.2.0-draft",
  "float_encoding": "IEEE754_BINARY64_BE_HEX",
  "data": {
    "context_id": "...",
    "constructs": []
  }
}
```

`data`只来自正式query envelope的`data`成员；`request_id/revision/profile_version/rule_version/freshness/page`不进入preimage。producer必须先验证query envelope及expected revision，再调用唯一API adapter提取digest view；禁止对整个response求摘要或从DOM/X6/Pinia重建Projection。

当前`API-CTX-002/0.2.0-draft`正式data固定为`{context_id,constructs,suppressed_states}`。`suppressed_states`是Inspector使用的非画布辅助清单，加入时间晚于Digest `0.1`冻结，禁止静默混入历史preimage。两端必须提供且只提供以下adapter：

```text
Node projectionDigestViewV01(apiProjectionData) -> {context_id,constructs}
Java ProjectionDigestV01.apiProjectionDigestView(apiProjectionData) -> {context_id,constructs}
```

adapter必须先拒绝顶层缺失/extra、非数组`suppressed_states`及其中缺失/extra或非法`state_id/owner_ref/name_or_value/state_roles/explicitness`，再原样保留`context_id/constructs`引用进入既有normalizer。`suppressed_states`不进入Digest `0.1` bytes；其一致性由完整API raw evidence、Revision document digest和上层deep comparison共同保护。任何未来需要让该清单参与Projection SHA的变更必须发布Digest `0.2`，不得重解释`0.1`。

### 4.2 封闭字段域

digest view、construct、layout、endpoint、modifier、label和binary64 tag的字段由preimage Schema递归`additionalProperties=false`。正式API data的额外`suppressed_states`只允许由第4.1节adapter验证后排除。construct必填：

```text
occurrence_id,target_id,construct_role,label,layout
```

允许的optional字段精确为：

```text
source_id,process_id,source_occurrence_id,target_occurrence_id,
symbol_ref,layout_ref,owner_id,owner_target_kind,state_roles,
explicitness,fold_state,capability_id,direction,endpoints,
modifiers,labels,collection_completeness
```

optional字段保持正式Projection中的“存在”或“缺省”；不得补`null`、空数组、默认枚举或派生字段。出现未知字段表示source contract已变化，`0.1`必须拒绝并要求评审新digest版本。

### 4.3 顺序

object key顺序不由normalizer决定，统一交给共享JCS owner按UTF-16 code unit排序。所有array保持正式Projection原顺序，包括`constructs/endpoints/modifiers/labels/state_roles`；禁止按ID、ordinal或展示顺序二次排序。

因此数组顺序变化会改变digest，这是正式Projection可观察语义的一部分。payload深度比较仍是Recovery/E2E verdict的必要条件，digest不替代Schema和semantic join。

## 5. Binary64唯一编码

### 5.1 允许位置

只有以下JSON Pointer pattern允许fractional/binary64输入：

```text
/data/constructs/<index>/layout/x
/data/constructs/<index>/layout/y
/data/constructs/<index>/layout/width
/data/constructs/<index>/layout/height
```

每个值必须是有限IEEE-754 binary64。转换后的值固定为：

```json
{"$binary64":"3fb999999999999a"}
```

tag object只允许`$binary64`一键，值必须是16位小写`[0-9a-f]`。

### 5.2 位与字节算法

Java：

```text
bits = Double.doubleToRawLongBits(value)
bytes = bits按ByteOrder.BIG_ENDIAN写成恰好8 bytes
hex = 每byte两位小写hex连接
```

Node：

```text
buffer = new ArrayBuffer(8)
new DataView(buffer).setFloat64(0, value, false) // false = big-endian
hex = Uint8Array(buffer)每byte两位小写hex连接
```

两端不得使用decimal string、`Double.toString`、`BigDecimal`、`Number.toString`、roundtrip formatter、locale、精度截断、epsilon或容差。`+0.0`编码为`0000000000000000`，`-0.0`编码为`8000000000000000`，二者digest必须不同。NaN和正负Infinity在读取raw bits前拒绝；NaN payload canonicalization不是本契约的一部分。

### 5.3 其他数字

`layout.z_order`和`endpoints[].ordinal`必须是`[-9007199254740991,9007199254740991]`内的JSON integer并原值保留。当前Java源值范围更窄不构成放宽机器契约的理由。

任何其他位置出现number、允许整数字段出现fractional number、unsafe integer或以string伪装数字，均拒绝。实现不得取整、clamp、转string或尝试binary64 tag。

## 6. Digest公式

```text
projection_digest_preimage_v01 = buildProjectionDigestPreimageV01(projection_data)
projection_canonical_bytes_v01 = UTF8(canonicalizeJcs(projection_digest_preimage_v01))
projection_sha256_v01 = lowercase_hex(SHA-256(projection_canonical_bytes_v01))
```

preimage必须先通过`opm-dev-canvas-06-projection-digest-preimage.schema.json`。共享JCS owner拒绝preimage表示实现违反本契约，不能降级到其他serializer。

raw Projection response、parsed data、preimage、canonical bytes和最终SHA是不同证据层；上层artifact可以只承载SHA，但producer/verifier必须能从其raw refs独立复算，不能相信Report自报值。

## 7. 稳定错误边界

### 7.1 错误码与首错

| Priority | Code | 条件 |
| ---: | --- | --- |
| 1 | `PROJECTION_DIGEST_INPUT_INVALID` | envelope/data不是受控输入、版本或revision/context join不闭合 |
| 2 | `PROJECTION_DIGEST_SCHEMA_MISMATCH` | 缺字段、extra、null/type/enum错误或禁止的字段形状 |
| 3 | `PROJECTION_DIGEST_UNICODE_INVALID` | string或object key含lone surrogate |
| 4 | `PROJECTION_DIGEST_NON_FINITE_FLOAT` | layout四字段为NaN或正负Infinity |
| 5 | `PROJECTION_DIGEST_NUMBER_DOMAIN_INVALID` | 非layout浮点、unsafe integer或数字位置错误 |
| 6 | `PROJECTION_DIGEST_FLOAT_ENCODING_FAILED` | 受支持有限值不能产生exact 8-byte/16-hex结果 |
| 7 | `PROJECTION_DIGEST_CANONICALIZATION_FAILED` | 已验证preimage被共享JCS owner拒绝 |
| 8 | `PROJECTION_DIGEST_HASH_FAILED` | SHA-256不可用或bytes/hash内部失败 |

先按priority，后按JSON Pointer的UTF-8 bytes升序选择唯一首错；数组index使用十进制无前导零。错误artifact必须记录`contract_version=0.1/error_code/json_pointer`，message仅供诊断，不参与机器分支。禁止把locale化exception class/message作为稳定结果。

### 7.2 事务与输出

摘要失败发生在写最终snapshot/attempt artifact之前：

1. 不写含空digest、placeholder或旧算法digest的Schema-valid artifact；
2. staging内诊断可保留，但不得进入final artifact index或READY Report；
3. Recovery映射为`RECOVERY_FIXTURE_MISMATCH`，该attempt按Recovery既有BLOCKED Report边界处理；
4. E2E映射为`E2E_FIXTURE_MISMATCH`，停止该case且不得生成伪matched attempt；
5. 若JCS owner或SHA runtime本身不可用，按各runner内部错误边界退出`4`，不得把环境错误伪装为业务mismatch。

## 8. Node/Java Parity Vectors

唯一raw文件：

```text
tests/e2e/release/dev-canvas-06/fixtures/projection-digest-v01-parity-vectors.json
```

正向量固定按以下顺序：

| vector_id | 覆盖 |
| --- | --- |
| `PDV01-EMPTY` | 空construct、顶层identity |
| `PDV01-SIGNED-ZERO` | `+0.0/-0.0/1.0/-2.5` raw bits |
| `PDV01-EXTREME-FINITE` | 正负最小subnormal、正负最大有限值 |
| `PDV01-FULL-ORDERED` | 多construct、非排序array、endpoint/modifier/label与普通小数 |

每项固定包含`vector_id/input_projection_data/expected_preimage/expected_canonical_utf8_hex/expected_projection_sha256`。vector Catalog自身必须继续落在safe-integer JCS值域，因此`input_projection_data`的layout四字段不是JSON float，而是`{"$input_binary64":"<16hex>"}`物化指令。Node loader按big-endian bytes执行`DataView.getFloat64(0,false)`，Java loader按big-endian bytes执行`ByteBuffer.getDouble()`，取得运行时number/double后删除input tag，再调用normalizer。正向量tag只允许有限binary64；loader不得先转decimal string。Node与Java必须从同一raw文件解析input，各自执行物化与normalizer，并同时比较expected preimage深度、canonical UTF-8 bytes和SHA；只比较最终SHA不构成parity通过。

负向量固定覆盖：`NAN/POSITIVE_INFINITY/NEGATIVE_INFINITY/MISSING_LAYOUT_FIELD/UNKNOWN_LAYOUT_FIELD/NON_LAYOUT_FRACTION/UNSAFE_INTEGER/UNKNOWN_CONSTRUCT_FIELD/LONE_SURROGATE`。`mutation`不是自由脚本，而是Schema封闭的`operation/json_pointer/value_token`；两端按第10章exact Catalog执行相同mutation并比较`expected_error_code/expected_error_pointer`。

## 9. Recovery与E2E绑定

### 9.1 Recovery

Recovery Execution的以下正式API Projection字段全部绑定Projection Digest `0.1`：

- `base_snapshot/before_snapshot/after_snapshot/reopen_snapshot.projection_digest`；
- reopen expectation对`projection_digest`的BEFORE/AFTER选择；
- normalized outcome中引用的snapshot Projection SHA。

snapshot reader必须调用正式`LocalApiService.projection(...)`，先验证response revision/context，再提取`.data`并应用本文算法。禁止直接对含浮点的data调用JCS。

Model template的既有`expected_result_digests.projection_sha256`不是正式API Projection摘要；它对`expected_result.projection={construct_kind,context_id,symbol_id,target_id,visible}`受控场景比较视图继续执行`sha256(JCS(...))`。两份template `0.1.0` bytes和七键digest不修改。实现、Report和文档必须称其为`scenario projection digest`，不得与snapshot `projection_digest`互相比较或替换。

### 9.2 E2E

E2E Attempt Artifact `0.1`的以下字段全部绑定Projection Digest `0.1`：

- `fixture-materialization.state_digests.projection_sha256`；
- `attempt-observation.projection_before_sha256/projection_after_sha256/projection_reopen_sha256`；
- `reopen-observation.projection_before_sha256/projection_reopen_sha256`；
- `semantic_comparison_digest`中引用的全部Projection SHA。

E2E raw API response仍按正式OpenAPI验证；digest producer从已验证response data构造preimage。Common Visual `expected_projection_sha256`继续对其独立safe-integer normalized payload求JCS/SHA，不改成本文binary64 preimage；二者字段名相似但source contract不同，禁止互用。

### 9.3 历史与升级

Recovery Report `0.1`和E2E Attempt Artifact `0.1`的上述字段从其首个可执行实现起永久解释为Projection Digest `0.1`。本轮没有既有真实Gate evidence需要迁移。

未来只要source Projection字段、numeric位置、array语义、tag、float encoding或preimage identity变化，必须：

1. 新建Projection Digest版本、Schema和vector文件；
2. 升Recovery/E2E上层artifact Schema版本；
3. 保留旧reader/verifier按旧版本复算；
4. 禁止用新算法重解释或覆盖旧SHA。

## 10. 机器输入身份

| Asset | Identity/version | Payload SHA-256 | Raw bytes | Raw SHA-256 |
| --- | --- | --- | ---: | --- |
| Preimage Schema | `urn:opm:contract:dev-canvas-06-projection-digest-preimage:0.1` | 不适用 | `4679` | `cc7e8811963498830f0fb5ce2aa197686c1fbdf089e9d3ef8efba36b8a672646` |
| Vector Schema | `urn:opm:contract:dev-canvas-06-projection-digest-parity-vectors:0.1` | 不适用 | `9725` | `ffd46e3c92c2381ea11c6c6dda0ece7cad4679a2335137b4243e308278b53417` |
| Vector Catalog | `dev-canvas-06.projection-digest-v01-parity/0.1.0` | `fd81cdfdc10c7137ecf48c314766251632f01fe6f6da458f0b1c47b1f49113f4` | `18778` | `470a4b2edd6368576bfe35e65f89dad9724109873084250cae5e9ed8e1b83f6d` |

Vector Catalog的`catalog_payload_sha256=sha256(UTF8(JCS(root删除catalog_payload_sha256后)))`。raw SHA对含一个结尾LF的原始文件bytes计算。任何bytes变化必须新建版本，禁止原地重算并继续使用相同identity。

## 11. 实现验收与状态边界

后续Node/Java实现至少证明：

1. 全部正向量input -> preimage -> bytes -> SHA相等；
2. 全部负向量稳定code/pointer相等；
3. 两端重复两次结果一致，vector raw bytes不变；
4. Recovery base/before/after/reopen和E2E materialization/attempt/reopen均使用同一owner；
5. 共享JCS既有10项vector与非法值回归不变；
6. producer/verifier不存在decimal fallback、容差、数组排序、字段忽略或第二JCS实现。

本文冻结完成后只允许：`DFR-018=FROZEN_INCLUDED`、`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`、全局`READY_FOR_DEVELOPMENT`。不得据此提升Recovery/E2E Gate、Candidate、Activation、Capability、production release或ISO 19450:2024状态。

## 12. 事实与假设

### 12.1 事实

1. 当前正式Projection layout四个geometry值是有限Java `double`；
2. 当前共享JCS Node/Java owner拒绝浮点；
3. 当前Recovery/E2E尚未生成可作为release verdict的完整Projection digest evidence；
4. Common Visual normalized Projection的geometry由其独立fixture契约限定为safe integer，不受本文算法替换。

### 12.2 假设

无开放实现假设。未来API-CTX-002字段变化、额外numeric字段或新的Projection source contract都必须先关闭开发门并升本契约版本，不能由实现者自行兼容。
