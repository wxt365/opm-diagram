package org.opm.localruntime.golden;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.text.OplParagraph;
import org.opm.localruntime.text.OplSentence;
import org.opm.localruntime.text.OplTextArtifact;
import org.opm.localruntime.text.OplTextTrace;
import org.opm.localruntime.text.OplToken;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

/** 生成 GATE-05-02 冻结的 OPL Text Artifact canonical bytes。 */
public final class OplGoldenArtifactCanonicalWriter {

    private final ObjectMapper objectMapper;

    public OplGoldenArtifactCanonicalWriter() {
        this(new ObjectMapper());
    }

    OplGoldenArtifactCanonicalWriter(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public byte[] write(OplTextArtifact artifact) {
        Objects.requireNonNull(artifact, "artifact must not be null");
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schema_id", "OPL-GOLDEN-ARTIFACT-001");
        root.put("schema_version", "0.1");
        root.put("artifact_id", normalized(artifact.artifactId()));
        root.put("revision_id", normalized(artifact.inputRevisionId()));
        root.put("modality", "OPL");
        root.put("context_id", normalized(artifact.contextId()));
        ObjectNode grammar = root.putObject("grammar_ref");
        grammar.put("id", normalized(artifact.grammarBinding().id()));
        grammar.put("version", normalized(artifact.grammarBinding().version()));
        grammar.put("sha256", normalized(artifact.grammarBinding().digest()));
        ArrayNode paragraphs = root.putArray("paragraphs");
        for (OplParagraph paragraph : artifact.paragraphs()) paragraph(paragraphs.addObject(), paragraph);
        try {
            return objectMapper.writeValueAsString(root).getBytes(StandardCharsets.UTF_8);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot write canonical OPL artifact", exception);
        }
    }

    public String sha256(OplTextArtifact artifact) {
        return sha256(write(artifact));
    }

    public String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    /** Trace 不进入 Artifact digest，但 replay 必须按冻结 Bundle 计算独立摘要。 */
    public byte[] writeTraces(String revisionId, List<OplTextTrace> traces) {
        Objects.requireNonNull(revisionId, "revisionId must not be null");
        Objects.requireNonNull(traces, "traces must not be null");
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schema_id", "OPL-GOLDEN-TRACE-001");
        root.put("schema_version", "0.1");
        root.put("revision_id", normalized(revisionId));
        ArrayNode serializedTraces = root.putArray("traces");
        for (OplTextTrace trace : traces) trace(serializedTraces.addObject(), trace);
        try {
            return objectMapper.writeValueAsString(root).getBytes(StandardCharsets.UTF_8);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot write canonical OPL traces", exception);
        }
    }

    public String sha256Traces(String revisionId, List<OplTextTrace> traces) {
        return sha256(writeTraces(revisionId, traces));
    }

    private void paragraph(ObjectNode target, OplParagraph paragraph) {
        target.put("paragraph_id", normalized(paragraph.paragraphId()));
        target.put("context_id", normalized(paragraph.contextId()));
        target.put("ordinal", paragraph.ordinal());
        ArrayNode sentences = target.putArray("sentences");
        for (OplSentence sentence : paragraph.sentences()) sentence(sentences.addObject(), sentence);
    }

    private void sentence(ObjectNode target, OplSentence sentence) {
        target.put("sentence_id", normalized(sentence.sentenceId()));
        target.put("ordinal", sentence.ordinal());
        target.put("sentence_slot", sentenceSlot(sentence));
        target.put("template_id", normalized(templateId(sentence)));
        target.put("utf8_text", normalized(sentence.text()));
        strings(target.putArray("generation_rule_ids"), sentence.generationRuleIds());
        strings(target.putArray("input_fact_ids"), sentence.inputFactIds());
        ArrayNode tokens = target.putArray("tokens");
        for (OplToken token : sentence.tokens()) token(tokens.addObject(), token);
    }

    private void token(ObjectNode target, OplToken token) {
        target.put("token_id", normalized(token.tokenId()));
        target.put("sentence_id", normalized(token.sentenceId()));
        target.put("ordinal", token.ordinal());
        target.put("text", normalized(token.text()));
        target.put("kind", token.kind().name());
        target.put("start_utf8_byte", token.startUtf8Byte());
        target.put("end_utf8_byte", token.endUtf8Byte());
        ArrayNode refs = target.putArray("source_refs");
        for (OplToken.SourceRef ref : token.sourceRefs()) source(refs.addObject(), ref);
    }

    private String templateId(OplSentence sentence) {
        return sentence.tokens().stream().flatMap(token -> token.sourceRefs().stream())
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE)
                .map(OplToken.SourceRef::stableId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Sentence does not reference a Template"));
    }

    private void trace(ObjectNode target, OplTextTrace trace) {
        target.put("trace_id", normalized(trace.traceId()));
        target.put("context_id", normalized(trace.contextId()));
        strings(target.putArray("fact_ids"), trace.factIds());
        strings(target.putArray("input_element_ids"), trace.inputElementIds());
        strings(target.putArray("occurrence_ids"), trace.occurrenceIds());
        strings(target.putArray("sentence_ids"), trace.sentenceIds());
        strings(target.putArray("rule_ids"), trace.ruleIds());
        digest(target.putObject("binding_digest"), trace.bindingDigest());
        ArrayNode ranges = target.putArray("token_ranges");
        for (OplTextTrace.TokenRange range : trace.tokenRanges()) {
            ranges.addObject().put("input_id", normalized(range.inputId()))
                    .put("start_utf8_byte", range.startUtf8Byte())
                    .put("end_utf8_byte", range.endUtf8Byte());
        }
        ArrayNode refs = target.putArray("source_refs");
        for (OplToken.SourceRef ref : trace.sourceRefs()) source(refs.addObject(), ref);
    }

    private void source(ObjectNode target, OplToken.SourceRef ref) {
        target.put("source_kind", ref.sourceKind().name());
        target.put("stable_id", normalized(ref.stableId()));
        if (ref.fieldPath() != null) target.put("field_path", normalized(ref.fieldPath()));
        if (ref.endpointOrdinal() != null) target.put("endpoint_ordinal", ref.endpointOrdinal());
        if (ref.sentenceSlot() != null) target.put("sentence_slot", normalized(ref.sentenceSlot()));
    }

    private String sentenceSlot(OplSentence sentence) {
        for (OplToken token : sentence.tokens()) {
            for (OplToken.SourceRef ref : token.sourceRefs()) {
                if (ref.sentenceSlot() != null) return ref.sentenceSlot();
            }
        }
        return "SINGLE";
    }

    private void strings(ArrayNode target, Iterable<String> values) {
        for (String value : values) target.add(normalized(value));
    }

    private void digest(ObjectNode target, String value) {
        target.put("algorithm", "sha256");
        target.put("digest", normalized(value));
    }

    private String normalized(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFC);
    }
}
