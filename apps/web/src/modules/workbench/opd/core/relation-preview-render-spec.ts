import type { ApiEdtAssetReference, ApiEdtNormalizedEndpoint } from "@/shared/api/generated/apiEdtContract";

import type { RelationCellSpec } from "./relation-render-spec";

export interface RelationPreviewRenderSpec {
  readonly candidateId: string;
  readonly capabilityId: string;
  readonly symbolDescriptor: ApiEdtAssetReference;
  readonly normalizedEndpoints: readonly ApiEdtNormalizedEndpoint[];
  readonly cells: readonly RelationCellSpec[];
  readonly primaryCellId: string;
  readonly ephemeral: true;
}
