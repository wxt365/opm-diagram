package org.opm.localruntime.releaseevidence.fault;

import java.util.Map;
import java.util.Objects;

/** 活动 Attempt Artifact Schema 中 faultPlan 分支的封闭 Java 表示。 */
public record E2EFaultPlan(String schemaId, String schemaVersion, String caseId, int attemptOrdinal,
                           FaultKind faultKind, Target target, int triggerCount, String nonce,
                           String planSha256, String artifactPayloadSha256) {
    public enum FaultKind { ASSET_MISSING, PERSISTENCE_FAILED, READONLY, NONE }
    public enum Target { SYMBOL_CATALOG_ASSET, SQLITE_BEFORE_REVISION_INSERT, PROJECT_STORAGE_READ_ONLY, NONE }

    public E2EFaultPlan {
        Objects.requireNonNull(schemaId); Objects.requireNonNull(schemaVersion); Objects.requireNonNull(caseId);
        Objects.requireNonNull(faultKind); Objects.requireNonNull(target); Objects.requireNonNull(nonce);
        Objects.requireNonNull(planSha256); Objects.requireNonNull(artifactPayloadSha256);
    }

    public Map<String, Object> planDigestPayload() {
        return Map.of("case_id", caseId, "attempt_ordinal", attemptOrdinal, "fault_kind", faultKind.name(),
                "target", target.name(), "trigger_count", triggerCount, "nonce", nonce);
    }

    public Map<String, Object> artifactPayload() {
        return Map.of("schema_id", schemaId, "schema_version", schemaVersion, "case_id", caseId,
                "attempt_ordinal", attemptOrdinal, "fault_kind", faultKind.name(), "target", target.name(),
                "trigger_count", triggerCount, "nonce", nonce, "plan_sha256", planSha256);
    }
}
