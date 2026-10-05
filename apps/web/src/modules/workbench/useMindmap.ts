import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { localRuntimeApi } from '@/shared/api/localRuntimeApi';
import type { DraftToken, MindmapDocument, MindmapResult } from '@/shared/api/generated/draftWorkspaceContract';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function checkResponse(value: MindmapResult, requestId: string, saved?: MindmapDocument) {
  if (value.request_id !== requestId || !value.document || !Number.isSafeInteger(value.document.revision) || value.document.revision < 0
      || saved && (value.document.id !== saved.id || value.document.revision !== saved.revision + 1)) throw new Error('脑图响应身份或修订不匹配，请重新读取核对。');
}

export function useMindmap(props: { projectId: string; modelId: string; token: DraftToken | null; readonly: boolean; generating?: boolean }, changed: (result: MindmapResult) => void, invalidate: () => void = () => {}) {
  const document = ref<MindmapDocument | null>(null), result = ref<MindmapResult | null>(null), error = ref(''), loading = ref(false), saving = ref(false), dirty = ref(false);
  const past = ref<MindmapDocument[]>([]), future = ref<MindmapDocument[]>([]); let version = 0, changes = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const saveLabel = computed(() => saving.value ? '正在保存分析…' : dirty.value ? '分析未保存' : document.value ? '分析已保存' : loading.value ? '正在读取分析…' : '分析未读取');
  async function load(force = false) {
    if (!props.token || props.readonly) return;
    if (dirty.value && !force) { error.value = '分析有未保存的修改，请保存后重新读取。'; return; }
    const sequence = ++version; loading.value = true; error.value = '';
    try {
      const requestId = `request.mindmap.${crypto.randomUUID()}`;
      const value = await localRuntimeApi.draftQuery(props.projectId, props.modelId, 'mindmap', { request_id: requestId, action: 'OPEN', draft_token: props.token });
      if (sequence !== version) return; checkResponse(value, requestId); result.value = value; document.value = clone(value.document); dirty.value = false; past.value = []; future.value = []; changed(value);
    } catch (cause) { if (sequence === version) error.value = cause instanceof Error ? cause.message : '读取脑图失败。'; }
    finally { if (sequence === version) loading.value = false; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { void save(); }, 700); }
  function edit(change: (document: MindmapDocument) => void) {
    if (!document.value || props.readonly || props.generating || loading.value) return;
    const next = clone(document.value); change(next); past.value.push(clone(document.value)); if (past.value.length > 40) past.value.shift();
    future.value = []; document.value = next; dirty.value = true; changes++; invalidate(); error.value = ''; schedule();
  }
  function history(redo: boolean) {
    const from = redo ? future : past, to = redo ? past : future;
    if (!document.value || !from.value.length || props.readonly || props.generating) return;
    to.value.push(clone(document.value)); const next = from.value.pop()!; next.revision = document.value.revision;
    document.value = next; dirty.value = true; changes++; invalidate(); schedule();
  }
  async function save(): Promise<boolean> {
    clearTimeout(timer);
    if (saving.value) { await new Promise<void>(resolve => { const stop = watch(saving, value => { if (!value) { stop(); resolve(); } }); }); return dirty.value ? save() : !error.value; }
    if (!dirty.value) return !error.value;
    if (!document.value || !props.token || props.readonly) return false;
    const sequence = version, captured = changes, sent = clone(document.value); saving.value = true; error.value = '';
    try {
      const requestId = `request.mindmap.${crypto.randomUUID()}`;
      const value = await localRuntimeApi.draftQuery(props.projectId, props.modelId, 'mindmap', { request_id: requestId, action: 'SAVE', draft_token: props.token, document: sent, expected_revision: sent.revision });
      if (sequence !== version) return false;
      checkResponse(value, requestId, sent);
      document.value!.revision = value.document.revision; result.value = value; dirty.value = captured !== changes; changed(value);
      if (dirty.value) { invalidate(); schedule(); } return !dirty.value;
    } catch (cause) { if (sequence === version) error.value = cause instanceof Error ? `分析保存失败：${cause.message}。当前内容已保留，可导出备份或重试。` : '分析保存失败。'; return false; }
    finally { if (sequence === version) saving.value = false; }
  }
  watch(() => [props.projectId, props.modelId], () => { version++; clearTimeout(timer); document.value = null; dirty.value = false; saving.value = false; void load(); }, { immediate: true });
  watch(() => [props.token?.draft_id, props.readonly], () => { if (!document.value && props.token && !props.readonly) void load(); });
  onBeforeUnmount(() => { clearTimeout(timer); version++; });
  return { document, result, error, loading, saving, dirty, past, future, saveLabel, load, edit, history, save };
}
