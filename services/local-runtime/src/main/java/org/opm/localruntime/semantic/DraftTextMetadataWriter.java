package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplToken;
import java.util.List;

/** 只更新草稿派生文本字段，绝不以语义 DTO 重写模型正文。 */
public final class DraftTextMetadataWriter {
    private static final ObjectMapper JSON = new ObjectMapper();
    private DraftTextMetadataWriter() { }

    public static void write(ObjectNode document, OplGenerationResult generated) {
        var artifact = generated.artifact();
        ObjectNode text = document.putObject("text_artifact").put("artifact_id", artifact.artifactId())
                .put("modality", "OPL").put("context_id", artifact.contextId());
        var grammar = text.putObject("grammar_ref").put("id", artifact.grammarBinding().id()).put("version", artifact.grammarBinding().version());
        grammar.set("digest", digest(artifact.grammarBinding().digest())); text.set("artifact_digest", digest(artifact.artifactDigest()));
        var sentences = text.putArray("sentences");
        for (var paragraph : artifact.paragraphs()) for (var sentence : paragraph.sentences()) {
            var item = sentences.addObject().put("sentence_id", sentence.sentenceId()).put("text", sentence.text()).put("ordinal", sentence.ordinal());
            item.set("generation_rule_ids", JSON.valueToTree(sentence.generationRuleIds())); item.set("input_fact_ids", JSON.valueToTree(sentence.inputFactIds()));
            var tokens = item.putArray("tokens");
            for (var token : sentence.tokens()) {
                var node = tokens.addObject().put("token_id", token.tokenId()).put("sentence_id", token.sentenceId()).put("ordinal", token.ordinal())
                        .put("kind", token.kind().name()).put("text", token.text()).put("start_utf8_byte", token.startUtf8Byte()).put("end_utf8_byte", token.endUtf8Byte());
                sources(node.putArray("source_refs"), token.sourceRefs());
            }
        }
        var traces = document.putArray("text_traces");
        for (var trace : generated.traces()) {
            var item = traces.addObject().put("trace_id", trace.traceId()).put("context_id", trace.contextId());
            item.set("fact_ids", JSON.valueToTree(trace.factIds())); item.set("input_element_ids", JSON.valueToTree(trace.inputElementIds()));
            item.set("occurrence_ids", JSON.valueToTree(trace.occurrenceIds())); item.set("sentence_ids", JSON.valueToTree(trace.sentenceIds()));
            item.set("rule_ids", JSON.valueToTree(trace.ruleIds())); item.set("binding_digest", digest(trace.bindingDigest()));
            var ranges = item.putArray("token_ranges");
            for (var range : trace.tokenRanges()) ranges.addObject().put("input_id", range.inputId()).put("start_utf8_byte", range.startUtf8Byte()).put("end_utf8_byte", range.endUtf8Byte());
            sources(item.putArray("source_refs"), trace.sourceRefs());
        }
    }

    private static ObjectNode digest(String hash) { return JSON.createObjectNode().put("algorithm", "sha256").put("digest", hash); }
    private static void sources(ArrayNode target, List<OplToken.SourceRef> refs) {
        for (var ref : refs) {
            var item = target.addObject().put("source_kind", ref.sourceKind().name()).put("stable_id", ref.stableId());
            if (ref.fieldPath() != null) item.put("field_path", ref.fieldPath());
            if (ref.endpointOrdinal() != null) item.put("endpoint_ordinal", ref.endpointOrdinal());
            if (ref.sentenceSlot() != null) item.put("sentence_slot", ref.sentenceSlot());
        }
    }
}
