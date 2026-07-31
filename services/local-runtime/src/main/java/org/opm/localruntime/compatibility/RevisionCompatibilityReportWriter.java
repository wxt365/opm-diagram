package org.opm.localruntime.compatibility;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** 写入 Compatibility Runner 的机器报告。 */
public final class RevisionCompatibilityReportWriter {

    private final ObjectMapper mapper = new ObjectMapper();

    public void write(Path target, Report report) {
        try {
            Files.createDirectories(target.toAbsolutePath().normalize().getParent());
            Files.writeString(target, mapper.writeValueAsString(tree(report)));
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot write revision compatibility report", exception);
        }
    }

    private ObjectNode tree(Report report) {
        ObjectNode root = mapper.createObjectNode();
        root.put("schema_id", "OPM-REVISION-COMPATIBILITY-REPORT-001");
        root.put("schema_version", "0.1");
        root.putObject("manifest").put("manifest_id", report.manifestId()).put("manifest_version", report.manifestVersion()).put("sha256", report.manifestSha256());
        root.put("runner_version", "0.1.0");
        ArrayNode schemas = root.putArray("schema_refs");
        schemas.add(report.schemaV01());
        schemas.add(report.schemaV02());
        root.set("historical_binding", report.historicalBinding());
        root.set("active_binding", report.activeBinding());
        root.put("case_count", report.cases().size());
        root.put("pass_count", report.cases().stream().filter(value -> value.status() == Status.PASS_MATCHED).count());
        root.put("blocked_count", report.cases().stream().filter(value -> value.status() == Status.BLOCKED_MATCHED).count());
        root.put("failed_count", report.cases().stream().filter(value -> value.status() == Status.FAILED).count());
        ArrayNode cases = root.putArray("cases");
        for (CaseResult value : report.cases()) caseResult(cases.addObject(), value);
        return root;
    }

    private void caseResult(ObjectNode target, CaseResult result) {
        target.put("case_id", result.caseId());
        target.put("expectation", result.expectation());
        target.put("observed_status", result.status().name());
        ArrayNode attempts = target.putArray("attempts");
        for (Attempt value : result.attempts()) {
            ObjectNode attempt = attempts.addObject();
            attempt.put("attempt", value.ordinal());
            attempt.put("observed_status", value.status().name());
            attempt.put("input_sha256", value.inputSha256());
            if (value.outputSha256() == null) attempt.putNull("output_sha256"); else attempt.put("output_sha256", value.outputSha256());
            if (value.availability() == null) attempt.putNull("availability"); else attempt.put("availability", value.availability());
            if (value.errorCode() == null) attempt.putNull("error_code"); else attempt.put("error_code", value.errorCode());
            if (value.detailCode() == null) attempt.putNull("detail_code"); else attempt.put("detail_code", value.detailCode());
            transaction(attempt.putObject("transaction"), value.transaction());
            if (value.headBefore() == null) attempt.putNull("head_before"); else attempt.put("head_before", value.headBefore());
            if (value.headAfter() == null) attempt.putNull("head_after"); else attempt.put("head_after", value.headAfter());
        }
    }

    private void transaction(ObjectNode target, Transaction value) {
        target.put("revision_delta", value.revisionDelta()); target.put("revision_parent_delta", value.revisionParentDelta());
        target.put("text_artifact_delta", value.textArtifactDelta()); target.put("text_trace_delta", value.textTraceDelta());
        target.put("finding_delta", value.findingDelta()); target.put("operation_delta", value.operationDelta());
        target.put("receipt_delta", value.receiptDelta()); target.put("draft_head_changed", value.draftHeadChanged());
    }

    public record Report(String manifestId, String manifestVersion, String manifestSha256, JsonNode schemaV01, JsonNode schemaV02,
                         JsonNode historicalBinding, JsonNode activeBinding, List<CaseResult> cases) { }
    public record CaseResult(String caseId, String expectation, Status status, List<Attempt> attempts) { }
    public record Attempt(int ordinal, Status status, String inputSha256, String outputSha256, String availability, String errorCode,
                          String detailCode, Transaction transaction, String headBefore, String headAfter) { }
    public record Transaction(int revisionDelta, int revisionParentDelta, int textArtifactDelta, int textTraceDelta,
                              int findingDelta, int operationDelta, int receiptDelta, boolean draftHeadChanged) { }
    public enum Status { PASS_MATCHED, BLOCKED_MATCHED, FAILED }
}
