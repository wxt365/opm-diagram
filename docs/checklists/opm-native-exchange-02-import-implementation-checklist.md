# EXCHANGE-02 持久化导入检查清单

状态：`VERIFIED_UNIT_SCOPE`

## Spec Mapping

- Spec：`specs/opm-native-exchange-02-import-implementation-task-spec.md`
- 设计：`docs/design/opm-native-exchange-import-design.md`
- Task Type：`feature`；Risk：`L3`；Primary Playbook：`none`

## Input Gate

- [x] EXCHANGE-01 的 Reader inspection、package digest 和零业务写入边界已存在。
- [x] `PROJECT_FULL`、`BASELINE_ASSET` layout、`NEW_PROJECT`、IdentityMap、V2 storage 与 staging 边界已冻结。
- [x] HTTP/OpenAPI、Profile 安装和其他 import mode 明确不在本切片。

## Build

- [x] Schema、layout parser 与 cross-entry closure。
- [x] V2 origin/identity mapping migration 与 duplicate guard。
- [x] staging transaction、derived index、验证/readback、atomic install。
- [x] `PROJECT_FULL`、`BASELINE_ASSET` 正向导入、源 Project 重映射、内部 identity 保留和 duplicate guard 定向测试。
- [ ] 多模型/多 Revision/多 Baseline 历史包与 SQLite 写入故障注入。

## Verify

- [x] EXCHANGE-02 定向 JUnit 通过。
- [x] EXCHANGE-01 回归、contract validate、diff check 通过。
- [ ] 未将定向测试表述为外部互操作、生产或 ISO 证据。

## Rollback

- [ ] 不自动删除已成功导入的 Project；只回退本切片代码和 V2 migration。
