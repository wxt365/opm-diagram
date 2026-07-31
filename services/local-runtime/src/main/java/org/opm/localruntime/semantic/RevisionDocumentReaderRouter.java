package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;

/** 按不可变 schema 标识分派 Revision 读取，禁止将历史文本伪装为 ACTIVE 证据。 */
public final class RevisionDocumentReaderRouter {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SemanticRevisionReader semanticReader = new SemanticRevisionReader();

    public RevisionDocumentEnvelope read(Path source) {
        try { return read(Files.readAllBytes(source)); }
        catch (IOException exception) { throw new SemanticReadException("Cannot read revision document", exception); }
    }

    public RevisionDocumentEnvelope read(byte[] raw) {
        try {
            JsonNode root = objectMapper.readTree(raw);
            if (root == null || !root.isObject() || !"MS-REV-001".equals(root.path("schema_id").asText())) {
                throw new SemanticReadException("REVISION_SCHEMA_UNSUPPORTED");
            }
            String version = root.path("schema_version").asText();
            if (!"0.1".equals(version) && !"0.2".equals(version)) throw new SemanticReadException("REVISION_SCHEMA_UNSUPPORTED");
            if ("0.1".equals(version) && (root.has("text_trace") || root.has("text_traces") || root.path("text_artifact").has("traces"))) {
                throw new SemanticReadException("REVISION_SCHEMA_SHAPE_INVALID");
            }
            RevisionDocumentEnvelope.TextEvidenceAvailability evidence = evidence(root, version);
            return new RevisionDocumentEnvelope("MS-REV-001", version, sha256(raw), semanticReader.read(new ByteArrayInputStream(raw)), evidence, "0.1".equals(version));
        } catch (IOException exception) {
            throw new SemanticReadException("Revision document is not valid JSON", exception);
        }
    }

    private RevisionDocumentEnvelope.TextEvidenceAvailability evidence(JsonNode root, String version) {
        if (!root.has("text_artifact")) return RevisionDocumentEnvelope.TextEvidenceAvailability.NOT_RECORDED;
        return "0.1".equals(version) ? RevisionDocumentEnvelope.TextEvidenceAvailability.STORED_TEXT_ONLY
                : RevisionDocumentEnvelope.TextEvidenceAvailability.FULL;
    }

    private String sha256(byte[] raw) {
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); }
        catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }
}
