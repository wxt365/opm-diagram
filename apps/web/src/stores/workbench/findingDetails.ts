import type { DraftFinding } from "@/shared/api/generated/draftWorkspaceContract";
import type { FindingWire } from "@/shared/api/localRuntimeApi";

export type ModelFinding = DraftFinding | FindingWire;
const descriptions: Record<string, [string, string]> = {
  DUPLICATE_ID: ["模型中存在重复标识", "检查重复元素或关系，保留正确项并重新创建冲突项。"],
  MISSING_REFERENCE: ["模型引用的元素不存在", "检查关系端点和状态所属元素，重新连接有效元素。"],
  CAPABILITY_BINDING_MISMATCH: ["建模能力与当前 Profile 不匹配", "检查关系类型和模型绑定的 Profile；需要时通过受支持的导入方式重建。"],
  INVALID_ENDPOINT: ["关系端点或控制修饰不符合规则", "检查关系方向、端点类型和控制修饰，删除错误关系后重新连接。"],
  STATE_OWNER_MISMATCH: ["状态与关系对象的归属不一致", "状态改变的输入和输出应属于同一对象，重新选择该对象的状态。"],
  INVALID_STATE_PRESENTATION: ["状态在 OPD 中的呈现不一致", "检查状态是否属于当前对象，以及显式、隐藏和折叠设置。"],
  CONTEXT_CLOSURE_VIOLATION: ["OPD 的引用或 OPL 追溯不完整", "检查当前图是否包含关系所需的对象、过程和状态。"],
  INVALID_LAYOUT: ["元素布局数据无效", "检查元素的位置和尺寸，通过移动或自动布局重新排版。"],
  INVALID_OWNERSHIP: ["元素或特征的所属关系无效", "检查特征所属元素以及对象、过程的类型。"],
  INVALID_REFINEMENT: ["父子 OPD 的细化关系无效", "检查子图对应的父级元素与图层级，必要时重新创建子图。"],
};

export function findingDetails(finding: ModelFinding) {
  const [title, suggestion] = descriptions[finding.category] ?? ["模型检查发现问题", "根据规则编号检查相关构造。"];
  const message = "message" in finding ? finding.message : "";
  return { title, suggestion, description: /[\u3400-\u9fff]/.test(message) ? message : title,
    diagnostic: message, severity: ({ BLOCKING: "阻断", WARNING: "警告", SUGGESTION: "建议" } as Record<string, string>)[finding.severity] ?? finding.severity };
}
