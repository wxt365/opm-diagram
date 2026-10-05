import type { DraftEditRequest, DraftToken } from "./generated/draftWorkspaceContract";
import type { PinRequest, SaveRequest } from "./generated/draftSaveContract";

export type DraftMutation = { operation: "EDIT"; request: DraftEditRequest }
  | { operation: "SAVE"; request: SaveRequest } | { operation: "PIN"; request: PinRequest };
export type DraftOperation = DraftMutation["operation"];

// 不调用 toJSON，不省略 undefined；保存与发送共用同一份无损 JSON 字符串。
export function draftRawJson(value: unknown): string { return serialize(value, false, new Set()); }

export function draftRequestCanonical(project: string, model: string, mutation: DraftMutation): string {
  const request: Record<string, unknown> = { ...mutation.request };
  if (mutation.operation === "EDIT") delete request.request_id;
  const identity = { EDIT: "DraftEditRequest/1", SAVE: "DraftSaveRequest/1", PIN: "DraftPinRequest/1" }[mutation.operation];
  return serialize({ ...request, identity_version: identity, project_id: project, model_id: model }, true, new Set());
}

export async function draftSha256(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function mutationId(mutation: DraftMutation): string {
  if (mutation.operation === "EDIT") return mutation.request.command_id;
  return mutation.operation === "SAVE" ? mutation.request.save_id : mutation.request.pin_id;
}

export function mutationToken(mutation: DraftMutation): DraftToken {
  return mutation.operation === "EDIT" ? mutation.request.expected_draft_token : mutation.request.target_draft_token;
}

export function validDraftToken(value: unknown): value is DraftToken {
  if (!value || typeof value !== "object" || Object.keys(value).sort().join() !== "binding_digest,draft_id,edit_seq") return false;
  const token = value as DraftToken;
  return validDraftId(token.draft_id) && Number.isSafeInteger(token.edit_seq) && token.edit_seq >= 0
    && typeof token.binding_digest === "string" && /^[a-f0-9]{64}$/.test(token.binding_digest);
}

export function sameDraftToken(a: DraftToken, b: DraftToken): boolean {
  return a.draft_id === b.draft_id && a.binding_digest === b.binding_digest && a.edit_seq === b.edit_seq;
}

export function validDraftId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value);
}

function serialize(value: unknown, identity: boolean, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return quote(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    if (!identity) return Object.is(value, -0) ? "-0" : JSON.stringify(value);
    const bytes = new Uint8Array(8); new DataView(bytes.buffer).setFloat64(0, value, false);
    return `{"binary64":"${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}"}`;
  }
  if (!value || typeof value !== "object" || ancestors.has(value)) invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      // Array.map 会略过空洞，必须逐项检查。
      return `[${Array.from({ length: value.length }, (_, index) => {
        if (!Object.hasOwn(value, index)) invalid();
        return serialize(value[index], identity, ancestors);
      }).join(",")}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid();
    if (Object.getOwnPropertySymbols(value).length) invalid();
    return `{${Object.keys(value).sort().map(key => {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !("value" in field)) invalid();
      return `${quote(key)}:${serialize(field.value, identity, ancestors)}`;
    }).join(",")}}`;
  } finally { ancestors.delete(value); }
}

function quote(value: string): string {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) invalid();
  }
  return JSON.stringify(value);
}

function invalid(): never { throw Object.assign(new TypeError("草稿请求必须为无损 JSON 值。"), { code: "INPUT_INVALID" }); }
