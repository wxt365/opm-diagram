# OPM 原生交换包机器契约

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`

## 1. 范围

本契约为 [原生交换包契约](opm-native-exchange-package-contract.md) 的首个可执行实现边界。`EXCHANGE-01` 实现 ZIP 容器、Manifest 校验、完整性与安全 inspection，以及 `MODEL_REVISION` 的内存读取适配器。

不实现 Project/Baseline 的 SQLite 写入、身份重映射、草稿创建、外部扩展解释、签名或加密。Reader 仅产生已验证的 inspection 或 `SemanticRevision`，不得修改数据库或活动项目。

## 2. Manifest 与目录

机器 Schema 固定为 `docs/contracts/schemas/opm-native-exchange-package-v1.schema.json`。首发包仅接受：

```text
manifest.json
model/model.json
revisions/<source_revision_id>.json
```

`MODEL_REVISION` 必须且只能有三条 entry：`MODEL_CATALOG`、`SEMANTIC_REVISION`、`CAPABILITY_REPORT`；后两条分别位于 `revisions/<source_revision_id>.json` 与 `evidence/capability-report.json`。首发适配器只读取 `SEMANTIC_REVISION`；另两条仍必须通过 Manifest 摘要和存在性校验。

`PROJECT_FULL` 与 `BASELINE_ASSET` 的 Manifest 允许被通用 Reader inspection，但没有 application adapter，返回 `EXCHANGE_ADAPTER_UNAVAILABLE`，不得导入。

## 3. 完整性与确定性

1. 所有 JSON entry 是 UTF-8 且不得含 BOM。Manifest 只含字符串、布尔、null 与安全整数，字节必须等于 RFC 8785 JCS 值的 UTF-8 字节。Revision 等业务 JSON 可以含 Decimal，使用 `ExchangeJsonCanonicalizer`：对象键按 Java `String.compareTo` 升序，数组保持原序，字符串按 JSON 转义，整数原样，Decimal 以 `BigDecimal.stripTrailingZeros().toPlainString()` 写出（零恒为 `0`），拒绝 NaN、Infinity、科学计数法输入和超出 `double` 有限值域的 Decimal。该算法不复用仅接受安全整数的共享 JCS owner。
2. entry 按 `logical_path` 升序写出；物理 ZIP 顺序不参与读取正确性。
3. `package_digest` 是 SHA-256(JCS(`package_digest_preimage`))。预像是 Manifest 删除 `package_digest` 后的完整对象；`entries` 必须按 `entry_id` Unicode 升序排列，且每个 `depends_on` 按 Unicode 升序排列。`manifest.json` 不在 `entries` 中。
4. 每条 entry 的 `sha256` 覆盖该 ZIP entry 的原始未压缩字节；`byte_length` 是原始未压缩字节数。
5. Writer 以 `manifest.json` 后接按路径升序的 entry 写入，所有 `ZipEntry` 时间固定为 Unix epoch。成功只以临时同目录文件 `fsync` 后原子 rename 到目标路径完成；失败删除临时文件且不覆盖既有目标。

## 4. 安全拒绝边界

默认上限固定为：最多 `64` 条 ZIP entry、单 entry 解压 `16 MiB`、总解压 `64 MiB`、压缩比最大 `100:1`、Manifest 最大 `1 MiB`、JSON 最大深度 `64`、JSON 字符串最大 `1 MiB`、每 entry 的 `depends_on` 最多 `32` 条。数字上限均含边界值。

Reader 在任何业务解析之前拒绝：重复 name、目录 entry、绝对路径、空路径、`.`/`..` 段、反斜杠、NUL、ZIP symbolic-link 外部属性、未知物理 entry、超过上限、CRC/ZIP 损坏、非 UTF-8 Manifest、非 canonical Manifest、重复 `entry_id`/`logical_path`、缺失 required entry、摘要不匹配、未知 required extension、格式版本不兼容和依赖不存在或循环。

稳定错误码：`EXCHANGE_IO_SECURITY_REJECTED`、`EXCHANGE_MANIFEST_INVALID`、`EXCHANGE_PACKAGE_DIGEST_MISMATCH`、`EXCHANGE_ENTRY_DIGEST_MISMATCH`、`EXCHANGE_FORMAT_UNSUPPORTED`、`EXCHANGE_REQUIRED_EXTENSION_UNSUPPORTED`、`EXCHANGE_REFERENCE_INVALID`、`EXCHANGE_ADAPTER_UNAVAILABLE`、`EXCHANGE_SEMANTIC_REVISION_INVALID`。

## 5. MODEL_REVISION 适配

适配器只在 Reader 已成功完成全部低层检查后调用 `RevisionDocumentReaderRouter.read(raw)`。`MODEL_CATALOG.model_id`、该 entry 的 `schema_id/schema_version` 与 document 根 `model_id/revision_id` 必须分别与 Manifest `source.model_id/source.revision_id` 完全一致。Writer 在写 ZIP 前执行同一交叉校验。任何差异返回 `EXCHANGE_SEMANTIC_REVISION_INVALID`。

## 6. 验收与回滚

`EXCHANGE-01` 必须覆盖确定性写入、entry 复读、Revision roundtrip、篡改、路径穿越、重复 entry、unknown required extension、版本不兼容、压缩/大小限制、循环依赖和零业务写入 inspection。实现不更改 SQLite DDL、OpenAPI 或既有语义 reader/writer；删除 exchange 包调用即可回退本轮新增功能。
