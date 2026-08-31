# Checklist: DEV-CANVAS-06 Stage A Release Discovery And Source Guard Closure

状态：`SOURCE_IMPLEMENTED / VERIFIED / CONTROLLED_EXECUTION_NOT_RUN`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标与复现 | 1~2 | D01~D04 |
| allowlist与累计计数 | 3 | D05~D10 |
| discovery契约 | 4 | D11~D15 |
| source guard | 5 | D16~D20 |
| 验收与回滚 | 6~7 | D21~D25 |

## Design Checklist

- [x] D01 Node 22下已复现旧`No tests found`断言失败。
- [x] D02 固定config已精确发现一个controlled release spec。
- [x] D03 unified source owner/test的四路径硬编码已定位。
- [x] D04 冲突属于设计allowlist缺口，不是Runtime语义失败。
- [x] D05 Stage A固定为`7=5 M+2 A`。
- [x] D06 discovery test是唯一新增累计路径。
- [x] D07 unified owner/test是C/A重叠路径。
- [x] D08 `O..A=25=15 M+10 A`。
- [x] D09 `O..R`由后继Stage R闭包最终修正为`43=31 M+12 A`。
- [x] D10 C/S/R与Source Set `0.2/24`不变。
- [x] D11 Playwright list只允许`process.execPath + @playwright/test/cli.js`且必须退出`0`。
- [x] D12 恰发现一个release spec。
- [x] D13 basename和title逐项固定。
- [x] D14 汇总固定为`1 test in 1 file`。
- [x] D15 config本身保持只读且禁止webServer/dev server。
- [x] D16 `FAULT_2A_DELTA`固定七项同序。
- [x] D17 A累计固定25项且重叠路径去重。
- [x] D18 final累计固定42项。
- [x] D19 Preflight Report字段不变，implementation_delta改七项。
- [x] D20 D01仍复核完整O/C/S/A parent链。
- [x] D21 Node 22定向与Runner全套命令已冻结。
- [x] D22 contract与diff验证已冻结。
- [x] D23 测试结果不得提升为D10B或发布证据。
- [x] D24 回滚不得恢复活动`No tests found`断言。
- [x] D25 禁止通过隐藏spec或放宽source guard绕过。

## Implementation Gate

- [x] I01 七项Stage A source全部按规格完成。
- [x] I02 discovery、source guard、controlled与Runner测试通过。
- [x] I03 A=`db854055...`以S为唯一parent形成clean commit。
- [x] I04 A patch SHA=`bb4848f2...b7cb70`且D01七项implementation_delta完成复核。

当前结论：`SOURCE_IMPLEMENTED / VERIFIED / D10B_AND_CONTROLLED_PLAYWRIGHT_NOT_RUN`。
