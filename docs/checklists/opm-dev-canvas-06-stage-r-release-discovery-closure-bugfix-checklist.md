# Checklist: DEV-CANVAS-06 Stage R Release Discovery Closure

状态：`DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标与复现 | 1~2 | RD01~RD04 |
| allowlist与计数 | 3 | RD05~RD09 |
| discovery与source guard | 4~5 | RD10~RD17 |
| 边界、验收与回滚 | 6~7 | RD18~RD23 |

## Design Closure

- [x] RD01 Stage A discovery正例固定一个Fault test。
- [x] RD02 Family bridge匹配同一release pattern。
- [x] RD03 Stage R旧allowlist不允许修正discovery test。
- [x] RD04 冲突可稳定导致Runner全套测试失败。
- [x] RD05 Stage R新增唯一`M scripts/canvas06-e2e-release-config.test.mjs`。
- [x] RD06 Stage R固定为`26=24 M+2 A`。
- [x] RD07 discovery test已在Stage A累计出现，`O..R`保持`45=33 M+12 A`。
- [x] RD08 C/S/A与O..A保持不变。
- [x] RD09 Source Set保持`0.2/24`与`9+15`。
- [x] RD10 Playwright list必须由受控`process.execPath`执行。
- [x] RD11 恰发现Family与Fault两个release test。
- [x] RD12 basename、标题、顺序和`2 tests in 2 files`固定。
- [x] RD13 config保持只读且无dev server。
- [x] RD14 `RUNNER_DELTA`固定26项。
- [x] RD15 最终累计delta固定45项。
- [x] RD16 source guard继续比较exact status/path。
- [x] RD17 禁止隐藏bridge或放宽为至少数量。
- [x] RD18 设计修改目录与后继实现路径已冻结。
- [x] RD19 公共API、Schema、SQLite、config和Source Set集合不变。
- [x] RD20 Node 22定向、Runner、contract和diff验收已冻结。
- [x] RD21 回滚必须整体恢复bridge/discovery/source guard。
- [x] RD22 测试不提升Gate或发布状态。
- [x] RD23 旧25/45只保留为历史口径。

## Implementation Acceptance

- [ ] I01 Family bridge已实现并被Playwright精确发现。
- [ ] I02 discovery test精确验证两个测试。
- [ ] I03 source guard精确接纳Stage R 26与累计45项。
- [ ] I04 Runner全套、contract和diff-check通过。
- [ ] I05 clean R commit、production `194/388`与Report按后继Gate独立形成。

当前结论：设计已冻结；实现、R、真实`194/388`、Report和Gate均未形成。
