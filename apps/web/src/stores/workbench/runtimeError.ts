import { LocalRuntimeApiError } from "@/shared/api/localRuntimeApi";

export function message(error: unknown) {
  return error instanceof LocalRuntimeApiError ? error.message : "本地请求失败，请重试。";
}
