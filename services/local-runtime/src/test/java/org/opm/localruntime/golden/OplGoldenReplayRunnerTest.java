package org.opm.localruntime.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import org.opm.localruntime.text.OplTextTrace;
import org.opm.localruntime.text.OplToken;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OplGoldenReplayRunnerTest {

    @Test
    void expandsTraceIndexTuplesAsTheFactAndSentenceCartesianProduct() {
        OplTextTrace trace = new OplTextTrace("trace.1", "context.1", List.of("fact.1", "fact.2"), List.of("element.1"),
                List.of("occurrence.1"), List.of("sentence.1", "sentence.2"), List.of("rule.1"), "a".repeat(64),
                List.of(new OplTextTrace.TokenRange("element.1", 0, 1)),
                List.of(new OplToken.SourceRef(OplToken.SourceKind.ELEMENT, "element.1", null, null, "SINGLE")));

        Set<OplGoldenReplayRunner.TraceIndexTuple> actual = OplGoldenReplayRunner.traceIndexTuples("revision.1", "model.1", List.of(trace));

        assertEquals(Set.of(
                new OplGoldenReplayRunner.TraceIndexTuple("revision.1", "model.1", "trace.1", "fact.1", "sentence.1", "context.1"),
                new OplGoldenReplayRunner.TraceIndexTuple("revision.1", "model.1", "trace.1", "fact.1", "sentence.2", "context.1"),
                new OplGoldenReplayRunner.TraceIndexTuple("revision.1", "model.1", "trace.1", "fact.2", "sentence.1", "context.1"),
                new OplGoldenReplayRunner.TraceIndexTuple("revision.1", "model.1", "trace.1", "fact.2", "sentence.2", "context.1")), actual);
    }

    @Test
    void replaysEveryManifestCaseTwiceWithIndependentCommittedDatabases() throws Exception {
        Path manifest = repositoryFile("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json");
        OplGoldenReplayReportWriter.Report report = new OplGoldenReplayRunner().run(manifest, Files.createTempDirectory("opm-golden-replay-"));
        JsonNode cases = new ObjectMapper().readTree(Files.readAllBytes(manifest)).required("cases");
        long expectedPass = java.util.stream.StreamSupport.stream(cases.spliterator(), false)
                .filter(item -> "PASS".equals(item.required("expectation").asText())).count();
        long expectedBlocked = cases.size() - expectedPass;

        assertEquals(cases.size(), report.cases().size());
        assertEquals(expectedPass, report.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED).count());
        assertEquals(expectedBlocked, report.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED).count());
        assertEquals(0, report.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.FAILED).count());
        report.cases().stream().filter(item -> "PASS".equals(item.expectation())).forEach(item -> {
            assertEquals(item.attempts().getFirst().traceSha256(), item.attempts().get(1).traceSha256());
            assertEquals(64, item.attempts().getFirst().traceSha256().length());
        });
        OplGoldenReplayReportWriter.CaseResult blocked = report.cases().stream()
                .filter(item -> item.caseId().equals("G-OPL-CTRL-001.RESULT.BLOCKED")).findFirst().orElseThrow();
        assertEquals(OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED, blocked.observedStatus());
        blocked.attempts().forEach(attempt -> {
            assertEquals("MODIFIER_COMBINATION_INVALID", attempt.errorCode());
            assertEquals(0, attempt.transaction().revisionDelta());
            assertEquals(0, attempt.transaction().textArtifactDelta());
            assertEquals(0, attempt.transaction().operationDelta());
            assertEquals(false, attempt.transaction().draftHeadChanged());
        });
        OplGoldenReplayReportWriter.CaseResult durationMissing = report.cases().stream()
                .filter(item -> item.caseId().equals("G-OPL-PROC-015.DURATION_MISSING.BLOCKED")).findFirst().orElseThrow();
        assertEquals(OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED, durationMissing.observedStatus());
        durationMissing.attempts().forEach(attempt -> assertEquals("INVALID_ARGUMENT", attempt.errorCode()));
        assertEquals(17, report.cases().stream().filter(item -> item.caseId().startsWith("G-OPL-PROC-")
                && item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED).count());
        JsonNode atomicCases = new ObjectMapper().readTree(Files.readAllBytes(manifest)).required("atomic_cases");
        assertEquals(atomicCases.size(), report.atomicCases().size());
        assertEquals(0, report.atomicCases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.FAILED).count());
        report.atomicCases().forEach(item -> item.attempts().forEach(attempt -> {
            assertEquals(OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED, attempt.observedStatus());
            assertEquals(0, attempt.transaction().revisionDelta());
            assertEquals(0, attempt.transaction().revisionParentDelta());
            assertEquals(0, attempt.transaction().textTraceDelta());
            assertEquals(0, attempt.transaction().findingDelta());
            assertEquals(0, attempt.transaction().operationDelta());
            assertEquals(0, attempt.transaction().receiptDelta());
            assertEquals(false, attempt.transaction().draftHeadChanged());
        }));
    }

    private Path repositoryFile(String relativePath) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve(relativePath);
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Repository file is not available: " + relativePath);
    }
}
