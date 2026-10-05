# Checklist: OPM P03 Object/Process 名称编辑

## Spec Mapping

- 规格：`specs/opm-p03-element-name-editing-task-spec.md`
- 验收：`NAME-EDIT-01` 至 `NAME-EDIT-07`
- 边界确认：不修改 schema、依赖、Profile 资产、`runtime-data/` 或 `UPDATE_LAYOUT` 语义。

## Build

- [x] `NAME-EDIT-01` OpenAPI、生成 DTO 与前端命令类型形成封闭 payload。
- [x] `NAME-EDIT-02` 创建与改名共用名称校验规则。
- [x] `NAME-EDIT-03` Runtime 名称替换、修订/幂等返回矩阵实现完成。
- [x] `NAME-EDIT-04` Capability Query allowed、reason 与 option 实现完成。
- [x] `NAME-EDIT-05` X6 双击 HTML input 覆盖层状态机实现完成。
- [x] `NAME-EDIT-06` Store 提交与 committed Revision 重读实现完成。

## Verify

- [x] 后端 Service/MVC 定向测试通过。
- [x] OpenAPI 生成与契约校验通过。
- [x] 前端 Store/组件定向测试通过。
- [x] typecheck、build 与 `git diff --check` 通过。
