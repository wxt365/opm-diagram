package org.opm.localruntime.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OplGoldenReplayReportWriterTest {

    @Test
    void writesFrozenMachineReportWithOrderedAttemptsAndTransactionDeltas() throws Exception {
        OplGoldenReplayReportWriter writer = new OplGoldenReplayReportWriter();
        Path report = Files.createTempDirectory("opm-golden-report-").resolve("report.json");
        OplGoldenReplayReportWriter.Transaction committed = new OplGoldenReplayReportWriter.Transaction(1, 1, 1, 1, 0, 1, 1, true);
        OplGoldenReplayReportWriter.Transaction blocked = new OplGoldenReplayReportWriter.Transaction(0, 0, 0, 0, 0, 0, 0, false);

        writer.write(report, new OplGoldenReplayReportWriter.Report(
                "golden.opl.iso19450.2024.draft", "0.2.0", "a".repeat(64), "0.1.0", "b".repeat(64), List.of(
                new OplGoldenReplayReportWriter.CaseResult("G-OPL-PROC-006.CONSUMPTION_STATE.PASS", "PASS",
                        OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED, List.of(
                        new OplGoldenReplayReportWriter.Attempt(1, OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED,
                                "c".repeat(64), "d".repeat(64), List.of("FACT", "COMMIT"), null, committed),
                        new OplGoldenReplayReportWriter.Attempt(2, OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED,
                                "c".repeat(64), "d".repeat(64), List.of("FACT", "COMMIT"), null, committed))),
                new OplGoldenReplayReportWriter.CaseResult("G-OPL-CTRL-001.RESULT.BLOCKED", "BLOCKED",
                        OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED, List.of(
                        new OplGoldenReplayReportWriter.Attempt(1, OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED,
                                null, null, List.of("TEXT"), "MODIFIER_COMBINATION_INVALID", blocked),
                        new OplGoldenReplayReportWriter.Attempt(2, OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED,
                                null, null, List.of("TEXT"), "MODIFIER_COMBINATION_INVALID", blocked))))));

        JsonNode root = new ObjectMapper().readTree(Files.readString(report));

        assertEquals("OPL-GOLDEN-REPLAY-REPORT-001", root.required("schema_id").asText());
        assertEquals("0.2", root.required("schema_version").asText());
        assertEquals(2, root.required("case_count").asInt());
        assertEquals(1, root.required("pass_count").asInt());
        assertEquals(1, root.required("blocked_count").asInt());
        assertEquals(0, root.required("failed_count").asInt());
        assertEquals(2, root.required("cases").size());
        JsonNode firstAttempt = root.required("cases").get(0).required("attempts").get(0);
        assertEquals(1, firstAttempt.required("attempt").asInt());
        assertEquals(1, firstAttempt.required("transaction").required("revision_delta").asInt());
        JsonNode blockedAttempt = root.required("cases").get(1).required("attempts").get(0);
        assertTrue(blockedAttempt.required("artifact_sha256").isNull());
        assertEquals("MODIFIER_COMBINATION_INVALID", blockedAttempt.required("error_code").asText());
        assertFalse(blockedAttempt.required("transaction").required("draft_head_changed").asBoolean());
    }
}
