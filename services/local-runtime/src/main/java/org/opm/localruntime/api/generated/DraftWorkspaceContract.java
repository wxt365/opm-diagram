package org.opm.localruntime.api.generated;

// 由 scripts/generate-draft-workspace-contract.mjs 生成，请勿手改。
public final class DraftWorkspaceContract {
    private DraftWorkspaceContract() { }
    public enum Type { MindmapRequest, MindmapResult, DraftModelPlanPreviewRequest, DraftModelPlanPreviewResult, OpenDraftRequest, OpenDraftResult, DraftQueryRequest, DraftProjectionResult, DraftTextResult, DraftNavigationResult, DraftFindingsResult, DraftRelationCatalogRequest, DraftRelationCatalogResult, DraftCapabilitiesRequest, DraftCapabilitiesResult, DraftEditRequest, DraftEditResult, DraftReceiptRequest, DraftReceiptResult, OperationHistoryRequest, OperationHistoryResult, MethodSummaryRequest, MethodSummaryResult, DraftError }

    /** 只允许从严格解码入口构造，输出副本不能修改已验证的请求。 */
    public static final class Document {
        private final Type type;
        private final com.fasterxml.jackson.databind.JsonNode value;
        private Document(Type type, com.fasterxml.jackson.databind.JsonNode value) { this.type = type; this.value = value.deepCopy(); }
        public Type type() { return type; }
        public com.fasterxml.jackson.databind.JsonNode value() { return value.deepCopy(); }
    }

    public static Document read(String raw, Type type) {
        java.util.Objects.requireNonNull(type, "草稿协议类型必填");
        return new Document(type, org.opm.localruntime.api.DraftWorkspaceSchema.read(raw, type.name()));
    }
}
