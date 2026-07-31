package org.opm.localruntime.golden;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.text.OplTextTrace;
import org.opm.localruntime.text.OplToken;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class OplGoldenTraceCanonicalWriterTest {

    @Test
    void writesTheFrozenTraceBundlePreimageAndBindsItToTheRevision() {
        OplGoldenArtifactCanonicalWriter writer = new OplGoldenArtifactCanonicalWriter();
        OplTextTrace trace = trace();

        String canonical = new String(writer.writeTraces("revision.trace", List.of(trace)), StandardCharsets.UTF_8);

        assertEquals("{\"schema_id\":\"OPL-GOLDEN-TRACE-001\",\"schema_version\":\"0.1\",\"revision_id\":\"revision.trace\",\"traces\":[{\"trace_id\":\"trace.1\",\"context_id\":\"context.1\",\"fact_ids\":[\"fact.1\"],\"input_element_ids\":[\"element.1\"],\"occurrence_ids\":[\"occurrence.1\"],\"sentence_ids\":[\"sentence.1\"],\"rule_ids\":[\"rule.1\"],\"binding_digest\":{\"algorithm\":\"sha256\",\"digest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"token_ranges\":[{\"input_id\":\"element.1\",\"start_utf8_byte\":0,\"end_utf8_byte\":5}],\"source_refs\":[{\"source_kind\":\"ELEMENT\",\"stable_id\":\"element.1\",\"field_path\":\"name.local_name\",\"endpoint_ordinal\":0,\"sentence_slot\":\"SINGLE\"}]}]}", canonical);
        assertNotEquals(writer.sha256Traces("revision.trace", List.of(trace)), writer.sha256Traces("revision.other", List.of(trace)));
    }

    private OplTextTrace trace() {
        return new OplTextTrace("trace.1", "context.1", List.of("fact.1"), List.of("element.1"), List.of("occurrence.1"),
                List.of("sentence.1"), List.of("rule.1"), "a".repeat(64), List.of(new OplTextTrace.TokenRange("element.1", 0, 5)),
                List.of(new OplToken.SourceRef(OplToken.SourceKind.ELEMENT, "element.1", "name.local_name", 0, "SINGLE")));
    }
}
