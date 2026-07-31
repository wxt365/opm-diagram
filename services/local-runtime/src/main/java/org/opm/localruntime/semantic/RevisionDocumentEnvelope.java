package org.opm.localruntime.semantic;

import java.util.Objects;

/** 保留修订版本、原始字节和文本证据边界的只读读取结果。 */
public record RevisionDocumentEnvelope(
        String schemaId,
        String schemaVersion,
        String rawSha256,
        SemanticRevision revision,
        TextEvidenceAvailability textEvidenceAvailability,
        boolean readOnly) {

    public RevisionDocumentEnvelope {
        schemaId = required(schemaId, "schemaId");
        schemaVersion = required(schemaVersion, "schemaVersion");
        rawSha256 = required(rawSha256, "rawSha256");
        revision = Objects.requireNonNull(revision, "revision must not be null");
        textEvidenceAvailability = Objects.requireNonNull(textEvidenceAvailability, "textEvidenceAvailability must not be null");
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
        return value;
    }

    public enum TextEvidenceAvailability { NOT_RECORDED, STORED_TEXT_ONLY, LEGACY_REPLAYED_TEXT, FULL }
}
