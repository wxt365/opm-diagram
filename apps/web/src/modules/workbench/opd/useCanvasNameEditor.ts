import type { Graph } from "@antv/x6";
import { nextTick, reactive, type Ref } from "vue";
import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "./core/node-geometry";

interface NameEditorProps {
  nodes: OpdNode[];
  selectedId: string;
  beginNameEdit?: (elementId: string) => Promise<boolean>;
  submitNameEdit?: (elementId: string, value: string) => Promise<boolean>;
}

/** 名称输入、IME 和提交生命周期；使用外部 Graph，不创建或销毁画布。 */
export function useCanvasNameEditor(props: NameEditorProps, canvasHost: Ref<HTMLDivElement | undefined>, nameInput: Ref<HTMLInputElement | undefined>, getGraph: () => Graph | undefined, updateRelationEditorAnchor: () => void) {
  const nameEditor = reactive({
    active: false,
    elementId: "",
    originalValue: "",
    value: "",
    submitting: false,
    composing: false,
    submitOnCompositionEnd: false,
    style: {} as Record<string, string>,
  });
  let nameEditRequest = 0;
  let nameSubmission: Promise<void> | undefined;

  function updateNameEditorPosition() {
    updateRelationEditorAnchor();
    const graph = getGraph();
    if (!graph || !canvasHost.value || !nameEditor.active) return;
    const node = props.nodes.find((item) => item.id === nameEditor.elementId);
    if (!node) {
      closeNameEditor();
      return;
    }
    const size = nodeDimensions(node);
    const clientRect = graph.localToClient({ x: node.x, y: node.y, width: size.width, height: size.height });
    const hostRect = canvasHost.value.getBoundingClientRect();
    const scale = clientRect.width / size.width;
    const width = node.kind === "process" ? clientRect.width * 0.75 : clientRect.width - 16 * scale;
    const height = Math.min(clientRect.height - 8 * scale, 26 * scale);
    nameEditor.style = {
      left: `${clientRect.x - hostRect.left + (clientRect.width - width) / 2}px`,
      top: `${clientRect.y - hostRect.top + (clientRect.height - height) / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
      fontSize: `${13 * scale}px`,
      backgroundColor: node.id === props.selectedId ? "#eaf3fc" : "#ffffff",
    };
  }

  async function openNameEditor(node: OpdNode) {
    if (!props.beginNameEdit || !props.submitNameEdit || (node.kind !== "object" && node.kind !== "process")) return;
    if (nameEditor.active && !await finishNameEdit()) return;
    const request = ++nameEditRequest;
    if (!await props.beginNameEdit(node.id) || request !== nameEditRequest) return;
    nameEditor.active = true;
    nameEditor.elementId = node.id;
    nameEditor.originalValue = node.label;
    nameEditor.value = node.label;
    nameEditor.submitting = false;
    nameEditor.composing = false;
    nameEditor.submitOnCompositionEnd = false;
    updateNameEditorPosition();
    await nextTick();
    nameInput.value?.focus();
    nameInput.value?.select();
  }

  function closeNameEditor() {
    nameEditRequest++;
    nameEditor.active = false;
    nameEditor.elementId = "";
    nameEditor.submitting = false;
    nameEditor.composing = false;
    nameEditor.submitOnCompositionEnd = false;
  }

  function submitNameEditor(): Promise<void> {
    if (nameSubmission) return nameSubmission;
    if (!nameEditor.active || nameEditor.composing || !props.submitNameEdit) return Promise.resolve();
    if (nameEditor.value === nameEditor.originalValue) {
      closeNameEditor();
      return Promise.resolve();
    }
    nameEditor.submitting = true;
    const request = nameEditRequest;
    const submission = props.submitNameEdit(nameEditor.elementId, nameEditor.value).then(async (succeeded) => {
      if (request !== nameEditRequest) return;
      if (succeeded) closeNameEditor();
      else {
        nameEditor.submitting = false;
        await nextTick();
        if (request === nameEditRequest) nameInput.value?.focus();
      }
    }).finally(() => { if (nameSubmission === submission) nameSubmission = undefined; });
    nameSubmission = submission;
    return submission;
  }

  async function finishNameEdit(): Promise<boolean> {
    if (!nameEditor.active) return true;
    if (nameEditor.composing) return false;
    await submitNameEditor();
    return !nameEditor.active;
  }

  function handleNameKeydown(event: KeyboardEvent) {
    if (nameEditor.composing || event.isComposing || nameEditor.submitting) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void submitNameEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeNameEditor();
    }
  }

  function handleNameBlur() {
    if (nameEditor.submitting) return;
    if (nameEditor.composing) nameEditor.submitOnCompositionEnd = true;
    else void submitNameEditor();
  }

  async function handleNameCompositionEnd() {
    nameEditor.composing = false;
    if (!nameEditor.submitOnCompositionEnd) return;
    nameEditor.submitOnCompositionEnd = false;
    const request = nameEditRequest;
    // 等待 v-model 接收输入法最终文本，不能提交尚未完成的拼音或旧值。
    await nextTick();
    if (request === nameEditRequest) await submitNameEditor();
  }

  return { nameInput, nameEditor, updateNameEditorPosition, openNameEditor, closeNameEditor, finishNameEdit, handleNameKeydown, handleNameBlur, handleNameCompositionEnd };
}
