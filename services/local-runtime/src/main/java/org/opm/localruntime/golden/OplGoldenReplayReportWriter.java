package org.opm.localruntime.golden;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;

/** 按 OPL Golden Replay Report 契约写入机器报告。 */
public final class OplGoldenReplayReportWriter {

    private final ObjectMapper objectMapper;

    public OplGoldenReplayReportWriter() {
        this(new ObjectMapper());
    }

    OplGoldenReplayReportWriter(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public void write(Path target, Report report) {
        Objects.requireNonNull(target, "target must not be null");
        Objects.requireNonNull(report, "report must not be null");
        try {
            Path parent = target.toAbsolutePath().normalize().getParent();
            if (parent != null) Files.createDirectories(parent);
            Files.writeString(target, objectMapper.writeValueAsString(tree(report)));
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot write OPL Golden replay report", exception);
        }
    }

    private ObjectNode tree(Report report) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schema_id", "OPL-GOLDEN-REPLAY-REPORT-001");
        root.put("schema_version", "0.2");
        ObjectNode manifest = root.putObject("manifest");
        manifest.put("manifest_id", report.manifestId());
        manifest.put("manifest_version", report.manifestVersion());
        manifest.put("sha256", report.manifestSha256());
        root.put("runner_version", report.runnerVersion());
        if (report.profileBindingDigest() != null) root.putObject("profile_binding").put("binding_digest", report.profileBindingDigest());
        root.put("case_count", report.cases().size());
        root.put("pass_count", report.cases().stream().filter(item -> item.observedStatus() == ObservedStatus.PASS_MATCHED).count());
        root.put("blocked_count", report.cases().stream().filter(item -> item.observedStatus() == ObservedStatus.BLOCKED_MATCHED).count());
        root.put("failed_count", report.cases().stream().filter(item -> item.observedStatus() == ObservedStatus.FAILED).count());
        ArrayNode cases = root.putArray("cases");
        for (CaseResult item : report.cases()) caseResult(cases.addObject(), item);
        root.put("atomic_case_count", report.atomicCases().size());
        root.put("atomic_blocked_count", report.atomicCases().stream().filter(item -> item.observedStatus() == ObservedStatus.BLOCKED_MATCHED).count());
        root.put("atomic_failed_count", report.atomicCases().stream().filter(item -> item.observedStatus() == ObservedStatus.FAILED).count());
        ArrayNode atomicCases = root.putArray("atomic_cases");
        for (AtomicCaseResult item : report.atomicCases()) atomicCaseResult(atomicCases.addObject(), item);
        return root;
    }

    private void caseResult(ObjectNode target, CaseResult result) {
        target.put("case_id", result.caseId());
        target.put("expectation", result.expectation());
        target.put("observed_status", result.observedStatus().name());
        ArrayNode attempts = target.putArray("attempts");
        for (Attempt resultAttempt : result.attempts()) attempt(attempts.addObject(), resultAttempt);
    }

    private void attempt(ObjectNode target, Attempt result) {
        target.put("attempt", result.attempt());
        target.put("observed_status", result.observedStatus().name());
        if (result.artifactSha256() == null) target.putNull("artifact_sha256"); else target.put("artifact_sha256", result.artifactSha256());
        if (result.traceSha256() == null) target.putNull("trace_sha256"); else target.put("trace_sha256", result.traceSha256());
        ArrayNode stages = target.putArray("stages");
        result.stages().forEach(stages::add);
        if (result.errorCode() == null) target.putNull("error_code"); else target.put("error_code", result.errorCode());
        ObjectNode transaction = target.putObject("transaction");
        transaction.put("revision_delta", result.transaction().revisionDelta());
        transaction.put("revision_parent_delta", result.transaction().revisionParentDelta());
        transaction.put("text_artifact_delta", result.transaction().textArtifactDelta());
        transaction.put("text_trace_delta", result.transaction().textTraceDelta());
        transaction.put("finding_delta", result.transaction().findingDelta());
        transaction.put("operation_delta", result.transaction().operationDelta());
        transaction.put("receipt_delta", result.transaction().receiptDelta());
        transaction.put("draft_head_changed", result.transaction().draftHeadChanged());
    }

    private void atomicCaseResult(ObjectNode target, AtomicCaseResult result) {
        target.put("case_id", result.caseId());
        target.put("category", result.category());
        target.put("observed_status", result.observedStatus().name());
        ArrayNode attempts = target.putArray("attempts");
        for (AtomicAttempt item : result.attempts()) atomicAttempt(attempts.addObject(), item);
    }

    private void atomicAttempt(ObjectNode target, AtomicAttempt result) {
        target.put("attempt", result.attempt());
        target.put("observed_status", result.observedStatus().name());
        target.put("commit_code", result.commitCode());
        target.put("detail_code", result.detailCode());
        target.put("fault_stage", result.faultStage());
        if (result.role() == null) target.putNull("role"); else target.put("role", result.role());
        ObjectNode mutation = target.putObject("actual_mutation");
        mutation.put("mutation", result.actualMutation().mutation());
        mutation.put("profile_digest", result.actualMutation().profileDigest());
        mutation.put("binding_digest", result.actualMutation().bindingDigest());
        transaction(target.putObject("transaction"), result.transaction());
    }

    private void transaction(ObjectNode target, Transaction result) {
        target.put("revision_delta", result.revisionDelta());
        target.put("revision_parent_delta", result.revisionParentDelta());
        target.put("text_artifact_delta", result.textArtifactDelta());
        target.put("text_trace_delta", result.textTraceDelta());
        target.put("finding_delta", result.findingDelta());
        target.put("operation_delta", result.operationDelta());
        target.put("receipt_delta", result.receiptDelta());
        target.put("draft_head_changed", result.draftHeadChanged());
    }

    public record Report(String manifestId, String manifestVersion, String manifestSha256, String runnerVersion,
                         String profileBindingDigest, List<CaseResult> cases, List<AtomicCaseResult> atomicCases) {
        public Report {
            cases = List.copyOf(Objects.requireNonNull(cases, "cases must not be null"));
            atomicCases = List.copyOf(Objects.requireNonNull(atomicCases, "atomicCases must not be null"));
        }

        public Report(String manifestId, String manifestVersion, String manifestSha256, String runnerVersion,
                      String profileBindingDigest, List<CaseResult> cases) {
            this(manifestId, manifestVersion, manifestSha256, runnerVersion, profileBindingDigest, cases, List.of());
        }
    }

    public record CaseResult(String caseId, String expectation, ObservedStatus observedStatus, List<Attempt> attempts) {
        public CaseResult { attempts = List.copyOf(Objects.requireNonNull(attempts, "attempts must not be null")); }
    }

    public record Attempt(int attempt, ObservedStatus observedStatus, String artifactSha256, String traceSha256,
                          List<String> stages, String errorCode, Transaction transaction) {
        public Attempt { stages = List.copyOf(Objects.requireNonNull(stages, "stages must not be null")); transaction = Objects.requireNonNull(transaction, "transaction must not be null"); }
    }

    public record Transaction(int revisionDelta, int revisionParentDelta, int textArtifactDelta, int textTraceDelta,
                              int findingDelta, int operationDelta, int receiptDelta, boolean draftHeadChanged) { }

    public record AtomicCaseResult(String caseId, String category, ObservedStatus observedStatus, List<AtomicAttempt> attempts) {
        public AtomicCaseResult { attempts = List.copyOf(Objects.requireNonNull(attempts, "attempts must not be null")); }
    }

    public record AtomicAttempt(int attempt, ObservedStatus observedStatus, String commitCode, String detailCode,
                                String faultStage, String role, ActualMutation actualMutation, Transaction transaction) {
        public AtomicAttempt {
            actualMutation = Objects.requireNonNull(actualMutation, "actualMutation must not be null");
            transaction = Objects.requireNonNull(transaction, "transaction must not be null");
        }
    }

    public record ActualMutation(String mutation, String profileDigest, String bindingDigest) { }

    public enum ObservedStatus { PASS_MATCHED, BLOCKED_MATCHED, FAILED }
}
