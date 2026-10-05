import type { ApiEdtCommandCapabilityOption, ApiEdtImpactSummary } from "@/shared/api/generated/apiEdtContract";
import type { DraftToken, ImpactSummary } from "@/shared/api/generated/draftWorkspaceContract";

// 仅统一展示字段；V1 Revision 与 V2 token 保持不同身份，授权仍由各协议 owner 验证。
export type WorkbenchCapabilityOption = Omit<ApiEdtCommandCapabilityOption, "expires_with_revision" | "reason_codes" | "impact_summary"> & {
  expires_with_revision?: string;
  expires_with_token?: DraftToken;
  reason_codes: string[];
  impact_summary?: ApiEdtImpactSummary | ImpactSummary;
};
