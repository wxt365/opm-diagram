import type { Graph } from "@antv/x6";
import type { Ref } from "vue";
import type { OpdNode } from "@/shared/types/modeling";
import { useCanvasNameEditor as useSharedNameEditor } from "@/shared/canvas/useCanvasNameEditor";
import { nodeDimensions } from "./core/node-geometry";

/** 保留 OPM 的状态编辑与节点尺寸规则，共用名称输入生命周期。 */
export function useCanvasNameEditor(props: {
  nodes: OpdNode[]; selectedId: string;
  beginNameEdit?: (id: string) => Promise<boolean>;
  submitNameEdit?: (id: string, value: string) => Promise<boolean>;
}, host: Ref<HTMLDivElement | undefined>, input: Ref<HTMLInputElement | undefined>, graph: () => Graph | undefined, updateAnchor: () => void) {
  const editor = useSharedNameEditor({
    get nodes() { return props.nodes.map(node => ({ ...node, ...nodeDimensions(node) })); },
    get selectedId() { return props.selectedId; },
    get beginNameEdit() { return props.beginNameEdit; },
    get submitNameEdit() { return props.submitNameEdit; },
  }, host, input, graph, updateAnchor);
  return { ...editor, openNameEditor: (node: OpdNode) => node.kind === "state" ? Promise.resolve() : editor.openNameEditor({ ...node, ...nodeDimensions(node) }) };
}
