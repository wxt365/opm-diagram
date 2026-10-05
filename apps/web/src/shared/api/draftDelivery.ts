import type { DraftEditResult, DraftToken, PinResult, SaveResult } from "./generated/draftWorkspaceContract";
import { localRuntimeApi, LocalRuntimeApiError } from "./localRuntimeApi";
import type { DraftMutationResults } from "./localRuntimeApi";
import { IndexedDbDraftPendingStore } from "./draftPendingStore";
import type { DraftLane, DraftPendingEntry, DraftPendingStore } from "./draftPendingStore";
import { draftRawJson, draftRequestCanonical, draftSha256, mutationId, mutationToken, sameDraftToken, validDraftId, validDraftToken } from "./draftRequestIdentity";
import type { DraftMutation } from "./draftRequestIdentity";

type DeliveryApi = Pick<typeof localRuntimeApi, "draftQuery" | "draftMutation">;
export type DraftDeliveryResult = DraftEditResult | SaveResult | PinResult;

export class DraftDelivery {
  constructor(private readonly store: DraftPendingStore = new IndexedDbDraftPendingStore(),
    private readonly api: DeliveryApi = localRuntimeApi) { }

  async submit<M extends DraftMutation>(project: string, model: string, mutation: M): Promise<DraftMutationResults[M["operation"]]> {
    const entry = await prepare(project, model, mutation);
    await this.store.add(entry);
    return this.send(entry, parseMutation(entry)) as Promise<DraftMutationResults[M["operation"]]>;
  }

  async pending(project: string, model: string): Promise<DraftPendingEntry[]> {
    const entries = await Promise.all([this.store.read(project, model, "EDIT"), this.store.read(project, model, "EXPLICIT")]);
    return entries.filter((entry): entry is DraftPendingEntry => entry !== null);
  }

  async recover(project: string, model: string, lane: DraftLane): Promise<DraftDeliveryResult | null> {
    const entry = await this.store.read(project, model, lane);
    if (!entry) return null;
    const mutation = await verifyEntry(entry, project, model, lane);
    const openId = requestId();
    const opened = await this.api.draftQuery(project, model, "open", { request_id: openId, context_id: null });
    if (opened.request_id !== openId || opened.project_id !== project || opened.model_id !== model
      || opened.mode !== "JOURNALED_DRAFT_V2" || !validDraftToken(opened.draft_token)) invalidResponse();
    const receiptId = requestId();
    const receipt = await this.api.draftQuery(project, model, "receipts", {
      request_id: receiptId, operation: entry.operation, idempotency_id: entry.idempotency_id,
    });
    if (receipt.request_id !== receiptId || receipt.operation !== entry.operation || receipt.idempotency_id !== entry.idempotency_id) invalidResponse();
    if (receipt.status === "FOUND") {
      if (receipt.request_digest !== entry.request_digest) invalidResponse();
      validateResult(mutation, receipt.result);
      await this.store.acknowledge(entry);
      return receipt.result;
    }
    if (receipt.status !== "NOT_FOUND" || receipt.result !== null || receipt.request_digest !== null) invalidResponse();
    const base = mutationToken(mutation), head = opened.draft_token;
    if (entry.operation === "EDIT" ? !sameDraftToken(head, base) : !covers(head, base))
      throw new LocalRuntimeApiError("DRAFT_CONFLICT", "草稿已变化，待确认输入已保留；未重新解释或重放。");
    return this.send(entry, mutation);
  }

  private async send(entry: DraftPendingEntry, mutation: DraftMutation): Promise<DraftDeliveryResult> {
    const result = await this.api.draftMutation(entry.project_id, entry.model_id, entry.operation, entry.raw);
    validateResult(mutation, result);
    await this.store.acknowledge(entry);
    return result;
  }
}

async function prepare(project: string, model: string, mutation: DraftMutation): Promise<DraftPendingEntry> {
  // 在任何 await 之前固定请求，不让调用者在摘要计算期间改变 token 或 payload。
  const raw = draftRawJson(mutation.request);
  const fixed = { operation: mutation.operation, request: JSON.parse(raw) } as DraftMutation;
  const expectedKeys = fixed.operation === "EDIT" ? "authorization,command,command_id,expected_draft_token,request_id,scope"
    : fixed.operation === "SAVE" ? "reason,save_id,target_draft_token" : "pin_id,purpose,target_draft_token";
  if (!validDraftId(project) || !validDraftId(model) || !["EDIT", "SAVE", "PIN"].includes(fixed.operation)
    || Object.keys(fixed.request).sort().join() !== expectedKeys || !validDraftId(mutationId(fixed)) || !validDraftToken(mutationToken(fixed))) invalidInput();
  if (fixed.operation === "SAVE" && fixed.request.reason !== "MANUAL") invalidInput();
  if (fixed.operation === "PIN" && !["PERMALINK", "SNAPSHOT", "BASELINE", "EXPORT"].includes(fixed.request.purpose)) invalidInput();
  if (fixed.operation === "EDIT" && (!fixed.request.scope || !fixed.request.command
    || fixed.request.scope.intent !== fixed.request.command.command_type || !validDraftId(fixed.request.request_id))) invalidInput();
  const canonical = draftRequestCanonical(project, model, fixed);
  return { version: 1, project_id: project, model_id: model, lane: fixed.operation === "EDIT" ? "EDIT" : "EXPLICIT",
    operation: fixed.operation, idempotency_id: mutationId(fixed), raw,
    raw_sha256: await draftSha256(raw), request_digest: await draftSha256(canonical) };
}

function parseMutation(entry: DraftPendingEntry): DraftMutation {
  return { operation: entry.operation, request: JSON.parse(entry.raw) } as DraftMutation;
}

async function verifyEntry(entry: DraftPendingEntry, project: string, model: string, lane: DraftLane): Promise<DraftMutation> {
  try {
    if (!entry || Object.keys(entry).sort().join() !== "idempotency_id,lane,model_id,operation,project_id,raw,raw_sha256,request_digest,version"
      || entry.version !== 1 || entry.project_id !== project || entry.model_id !== model || entry.lane !== lane) invalidInput();
    const mutation = parseMutation(entry);
    const expected = await prepare(project, model, mutation);
    if (draftRawJson(expected) !== draftRawJson(entry)) invalidInput();
    return mutation;
  } catch { throw new LocalRuntimeApiError("DRAFT_PENDING_INVALID", "本地待确认记录校验失败，原始数据已保留。"); }
}

function validateResult(mutation: DraftMutation, result: DraftDeliveryResult): void {
  if (!result || typeof result !== "object" || Array.isArray(result)) invalidResponse();
  const base = mutationToken(mutation);
  if (mutation.operation === "EDIT") {
    const edited = result as DraftEditResult;
    if (Object.keys(edited).sort().join() !== "affected_ids,base_token,command_id,content_digest,request_id,result_token,status,text_trace_ids,validation_summary"
      || edited.command_id !== mutation.request.command_id || edited.request_id !== mutation.request.request_id
      || !validDraftToken(edited.base_token) || !sameDraftToken(edited.base_token, base)
      || !validDraftToken(edited.result_token) || !covers(edited.result_token, base)
      || !["DURABLE", "UNCHANGED"].includes(edited.status)
      || edited.result_token.edit_seq !== base.edit_seq + (edited.status === "DURABLE" ? 1 : 0)
      || typeof edited.content_digest !== "string" || !/^[a-f0-9]{64}$/.test(edited.content_digest)
      || !Array.isArray(edited.affected_ids) || !edited.affected_ids.every(validDraftId)
      || !Array.isArray(edited.text_trace_ids) || !edited.text_trace_ids.every(validDraftId)
      || !validSummary(edited.validation_summary)) invalidResponse();
    return;
  }
  const saved = result as SaveResult | PinResult;
  if (!validDraftToken(saved.captured_token) || !sameDraftToken(saved.captured_token, base) || !validDraftId(saved.revision_id)) invalidResponse();
  if (mutation.operation === "PIN") {
    if (Object.keys(saved).sort().join() !== "captured_token,pin_id,revision_id" || !("pin_id" in saved) || saved.pin_id !== mutation.request.pin_id) invalidResponse();
  } else if (Object.keys(saved).sort().join() !== "captured_token,checkpoint_id,head_token,revision_id,save_id,status"
    || !("save_id" in saved) || saved.save_id !== mutation.request.save_id || !["SAVED", "UNCHANGED"].includes(saved.status)
    || !validDraftId(saved.checkpoint_id) || !validDraftToken(saved.head_token) || !covers(saved.head_token, base)) invalidResponse();
}

function validSummary(value: DraftEditResult["validation_summary"]): boolean {
  return !!value && Object.keys(value).sort().join() === "blocking,coverage_state,suggestion,warning"
    && [value.blocking, value.warning, value.suggestion].every(count => Number.isSafeInteger(count) && count >= 0)
    && ["COMPLETE", "INCOMPLETE", "EVIDENCE_MISSING"].includes(value.coverage_state);
}

function covers(head: DraftToken, base: DraftToken): boolean {
  return head.draft_id === base.draft_id && head.binding_digest === base.binding_digest && head.edit_seq >= base.edit_seq;
}
function requestId(): string { return `request.delivery.${crypto.randomUUID().replaceAll("-", "")}`; }
function invalidInput(): never { throw new LocalRuntimeApiError("INPUT_INVALID", "草稿请求身份或结构无效。"); }
function invalidResponse(): never { throw new LocalRuntimeApiError("DRAFT_RESPONSE_INVALID", "草稿响应身份或内容不一致，待确认输入已保留。"); }
