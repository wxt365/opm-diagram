package org.opm.localruntime.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.OplSymbolCatalogAssetLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplSentence;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.OplTextTrace;
import org.opm.localruntime.text.OplToken;
import org.opm.localruntime.text.TextGenerationAssets;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 仅用于编写期导出静态 Procedural、Control 和 Structural PASS Golden 资产。 */
public final class OplProceduralPassGoldenAuthorCli {

    private static final Path PROFILE_ROOT_RELATIVE = Path.of("packages/profiles/profile.iso19450.2024.draft/0.2.0");
    private static final String BASE_FIXTURE = "golden/fixtures/base-golden.proc.001.json";

    private OplProceduralPassGoldenAuthorCli() { }

    public static void main(String[] args) throws Exception {
        boolean write = java.util.Arrays.asList(args).contains("--write");
        boolean control = java.util.Arrays.asList(args).contains("--control");
        boolean structural = java.util.Arrays.asList(args).contains("--structural");
        if (control && structural || args.length != (write ? 1 : 0) + (control ? 1 : 0) + (structural ? 1 : 0)) {
            throw new IllegalArgumentException("Usage: OplProceduralPassGoldenAuthorCli [--write] [--control|--structural]");
        }
        new OplProceduralPassGoldenAuthorCli().sync(write, control, structural);
    }

    private void sync(boolean write, boolean control, boolean structural) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        Path profileRoot = repositoryPath(PROFILE_ROOT_RELATIVE);
        Path manifestPath = profileRoot.resolve("golden/opm-opl-golden-manifest.json");
        Path definitionsPath = profileRoot.resolve(structural ? "golden/opm-opl-coverage-catalog.json"
                : control ? "golden/opm-opl-control-pass-definitions.json" : "golden/opm-opl-procedural-pass-definitions.json");
        ObjectNode manifest = requiredObject(mapper.readTree(Files.readAllBytes(manifestPath)), "manifest");
        List<Definition> definitions = definitions(mapper.readTree(Files.readAllBytes(definitionsPath)), structural);
        int expectedDefinitionCount = structural ? 94 : control ? 20 : 16;
        if (definitions.size() != expectedDefinitionCount) throw new IllegalStateException("Golden PASS definitions must contain exactly " + expectedDefinitionCount + " entries");
        JsonNode references = manifest.required("cases").get(0);
        ArrayNode cases = mapper.createArrayNode();
        List<JsonNode> structuralBlocked = new ArrayList<>();
        String prefix = structural ? "G-OPL-STRUCT-" : control ? "G-OPL-CTRL-" : "G-OPL-PROC-";
        for (JsonNode existing : manifest.required("cases")) {
            if (structural && existing.required("case_id").asText().startsWith(prefix) && "BLOCKED".equals(existing.required("expectation").asText())) {
                structuralBlocked.add(existing);
            } else if (!(existing.required("case_id").asText().startsWith(prefix) && "PASS".equals(existing.required("expectation").asText()))) {
                cases.add(existing);
            }
        }
        String baseFixture = structural ? "golden/fixtures/base-golden.struct.003.json" : BASE_FIXTURE;
        for (Definition definition : definitions) cases.add(exportCase(mapper, definition, references, profileRoot, baseFixture));
        structuralBlocked.forEach(cases::add);
        List<JsonNode> orderedCases = new ArrayList<>();
        cases.forEach(orderedCases::add);
        orderedCases.sort(Comparator.comparing(item -> item.required("case_id").asText()));
        ArrayNode canonicalCases = mapper.createArrayNode();
        orderedCases.forEach(canonicalCases::add);
        manifest.set("cases", canonicalCases);
        byte[] bytes = (mapper.writerWithDefaultPrettyPrinter().writeValueAsString(manifest) + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (Files.exists(manifestPath) && java.util.Arrays.equals(bytes, Files.readAllBytes(manifestPath))) return;
        if (!write) throw new IllegalStateException("Generated Procedural PASS Golden assets are out of date: " + manifestPath);
        Files.write(manifestPath, bytes);
    }

    private ObjectNode exportCase(ObjectMapper mapper, Definition definition, JsonNode references, Path profileRoot, String baseFixture) throws Exception {
        Path fixture = profileRoot.resolve(definition.fixturePath());
        SemanticRevision candidate = new SemanticRevisionReader().read(fixture);
        SemanticRevision.Fact fact = candidate.facts().getFirst();
        if (!definition.baseCapabilityId().equals(fact.capability().capabilityId())) {
            throw new IllegalStateException("Candidate capability differs from definition: " + definition.caseId());
        }
        TextGenerationAssets assets = new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot.getParent().getParent()))
                .assemble(candidate.profileBinding());
        OplGenerationResult generated = new OplTextGenerationService().generate(candidate, candidate.rootContextId(), assets);
        List<OplSentence> sentences = generated.artifact().paragraphs().stream().flatMap(paragraph -> paragraph.sentences().stream()).toList();
        List<String> expectedRuleIds = definition.controlCapabilityId() == null
                ? List.of(assets.capability(fact.capability().capabilityId()).ruleRef())
                : List.of(assets.capability(fact.capability().capabilityId()).ruleRef(), assets.capability(definition.controlCapabilityId()).ruleRef());
        if (sentences.size() != definition.templateIds().size()) {
            throw new IllegalStateException("Runtime sentence count differs from Golden definition: " + definition.caseId());
        }
        for (int index = 0; index < sentences.size(); index++) {
            OplSentence sentence = sentences.get(index);
            if (!definition.templateIds().get(index).equals(templateId(sentence))
                    || definition.canonicalText() != null && !definition.canonicalText().equals(sentence.text())
                    || !expectedRuleIds.equals(sentence.generationRuleIds())) {
                throw new IllegalStateException("Runtime output differs from Golden definition: " + definition.caseId());
            }
        }
        OplSymbolCatalogAssetLoader.Projection projection = assets.symbolCatalog().resolve(fact);
        ObjectNode goldenCase = mapper.createObjectNode();
        goldenCase.put("case_id", definition.caseId());
        goldenCase.put("capability_id", definition.controlCapabilityId() == null ? definition.baseCapabilityId() : definition.controlCapabilityId());
        if (definition.controlCapabilityId() != null) goldenCase.put("base_fact_capability_id", definition.baseCapabilityId());
        goldenCase.put("variant_key", definition.variantKey());
        goldenCase.put("expectation", "PASS");
        goldenCase.put("base_revision_fixture", baseFixture);
        goldenCase.put("input_revision_fixture", definition.fixturePath());
        copy(goldenCase, references, "profile_ref");
        copy(goldenCase, references, "rule_set_ref");
        copy(goldenCase, references, "grammar_ref");
        copy(goldenCase, references, "symbol_catalog_ref");
        copy(goldenCase, references, "normalization_adapter_ref");
        goldenCase.put("binding_digest", references.required("binding_digest").asText());
        goldenCase.set("expected_normalized_fact", mapper.readTree(Files.readAllBytes(fixture)).required("facts").get(0));
        projection(goldenCase.putObject("expected_projection"), projection);
        ArrayNode expectedSentences = goldenCase.putArray("expected_sentences");
        for (int index = 0; index < sentences.size(); index++) expectedSentences.add(sentence(mapper, sentences.get(index), generated.traces().get(index)));
        goldenCase.put("expected_artifact_sha256", generated.artifact().artifactDigest());
        return goldenCase;
    }

    private ObjectNode sentence(ObjectMapper mapper, OplSentence sentence, OplTextTrace trace) {
        ObjectNode node = mapper.createObjectNode();
        node.put("sentence_id", sentence.sentenceId());
        node.put("sentence_slot", sentenceSlot(sentence));
        node.put("template_id", templateId(sentence));
        node.put("ordinal", sentence.ordinal());
        node.put("utf8_text", sentence.text());
        strings(node.putArray("generation_rule_ids"), sentence.generationRuleIds());
        strings(node.putArray("input_fact_ids"), sentence.inputFactIds());
        ArrayNode tokens = node.putArray("tokens");
        for (OplToken token : sentence.tokens()) token(tokens.addObject(), token);
        trace(node.putObject("trace"), trace);
        return node;
    }

    private void projection(ObjectNode node, OplSymbolCatalogAssetLoader.Projection value) {
        node.put("symbol_id", value.symbolId()); nullable(node, "line", value.line()); nullable(node, "source_marker", value.sourceMarker());
        nullable(node, "target_marker", value.targetMarker()); nullable(node, "junction_marker", value.junctionMarker());
        nullable(node, "annotation", value.annotation()); nullable(node, "completeness_annotation", value.completenessAnnotation());
        strings(node.putArray("label_slots"), value.labelSlots()); node.put("route_family", value.routeFamily());
    }

    private void token(ObjectNode node, OplToken value) {
        node.put("token_id", value.tokenId()); node.put("sentence_id", value.sentenceId()); node.put("ordinal", value.ordinal());
        node.put("text", value.text()); node.put("kind", value.kind().name()); node.put("start_utf8_byte", value.startUtf8Byte()); node.put("end_utf8_byte", value.endUtf8Byte());
        ArrayNode refs = node.putArray("source_refs"); for (OplToken.SourceRef ref : value.sourceRefs()) source(refs.addObject(), ref);
    }

    private void trace(ObjectNode node, OplTextTrace value) {
        node.put("trace_id", value.traceId()); node.put("context_id", value.contextId()); strings(node.putArray("fact_ids"), value.factIds());
        strings(node.putArray("input_element_ids"), value.inputElementIds()); strings(node.putArray("occurrence_ids"), value.occurrenceIds());
        strings(node.putArray("sentence_ids"), value.sentenceIds()); strings(node.putArray("rule_ids"), value.ruleIds());
        node.putObject("binding_digest").put("algorithm", "sha256").put("digest", value.bindingDigest());
        ArrayNode ranges = node.putArray("token_ranges"); for (OplTextTrace.TokenRange range : value.tokenRanges()) ranges.addObject()
                .put("input_id", range.inputId()).put("start_utf8_byte", range.startUtf8Byte()).put("end_utf8_byte", range.endUtf8Byte());
        ArrayNode refs = node.putArray("source_refs"); for (OplToken.SourceRef ref : value.sourceRefs()) source(refs.addObject(), ref);
    }

    private void source(ObjectNode node, OplToken.SourceRef value) {
        node.put("source_kind", value.sourceKind().name()); node.put("stable_id", value.stableId());
        if (value.fieldPath() != null) node.put("field_path", value.fieldPath());
        if (value.endpointOrdinal() != null) node.put("endpoint_ordinal", value.endpointOrdinal());
        if (value.sentenceSlot() != null) node.put("sentence_slot", value.sentenceSlot());
    }

    private String templateId(OplSentence sentence) { return sentence.tokens().stream().flatMap(token -> token.sourceRefs().stream())
            .filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE).map(OplToken.SourceRef::stableId).findFirst().orElseThrow(); }
    private String sentenceSlot(OplSentence sentence) { return sentence.tokens().stream().flatMap(token -> token.sourceRefs().stream())
            .map(OplToken.SourceRef::sentenceSlot).filter(java.util.Objects::nonNull).findFirst().orElse("SINGLE"); }
    private void copy(ObjectNode target, JsonNode source, String field) { target.set(field, source.required(field)); }
    private void nullable(ObjectNode target, String field, String value) { if (value == null) target.putNull(field); else target.put(field, value); }
    private void strings(ArrayNode target, Iterable<String> values) { for (String value : values) target.add(value); }
    private ObjectNode requiredObject(JsonNode node, String name) { if (!node.isObject()) throw new IllegalArgumentException(name + " must be an object"); return (ObjectNode) node; }

    private Path repositoryPath(Path relativePath) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isDirectory(current.resolve("packages")) && Files.isRegularFile(current.resolve("package.json"))) return current.resolve(relativePath);
            current = current.getParent();
        }
        throw new IllegalStateException("Cannot locate repository root");
    }

    private List<Definition> definitions(JsonNode node, boolean structural) {
        if (structural) return structuralDefinitions(node);
        if (!node.isArray()) throw new IllegalArgumentException("Procedural PASS definitions must be an array");
        List<Definition> result = new ArrayList<>(); Map<String, Boolean> ids = new HashMap<>();
        for (JsonNode item : node) {
            String controlCapabilityId = item.path("base_fact_capability_id").isMissingNode() ? null : item.required("capability_id").asText();
            String baseCapabilityId = controlCapabilityId == null ? item.required("capability_id").asText() : item.required("base_fact_capability_id").asText();
            Definition definition = new Definition(item.required("case_id").asText(), baseCapabilityId, controlCapabilityId,
                    item.required("variant_key").asText(), List.of(item.required("template_id").asText()), item.required("canonical_text").asText());
            if (ids.put(definition.caseId(), true) != null) throw new IllegalArgumentException("Duplicate Procedural PASS definition: " + definition.caseId());
            result.add(definition);
        }
        return List.copyOf(result);
    }

    private List<Definition> structuralDefinitions(JsonNode catalog) {
        if (!catalog.isObject() || !catalog.required("requirements").isArray()) {
            throw new IllegalArgumentException("Structural coverage catalog must contain requirements");
        }
        List<Definition> result = new ArrayList<>(); Map<String, Boolean> ids = new HashMap<>();
        for (JsonNode item : catalog.required("requirements")) {
            if (!"STRUCT".equals(item.path("family").asText()) || !"PASS".equals(item.path("expectation").asText())) continue;
            List<String> templateIds = new ArrayList<>();
            for (JsonNode template : item.required("required_template_ids")) templateIds.add(template.asText());
            Definition definition = new Definition(item.required("case_id").asText(), item.required("capability_id").asText(), null,
                    item.required("variant_key").asText(), List.copyOf(templateIds), null);
            if (ids.put(definition.caseId(), true) != null) throw new IllegalArgumentException("Duplicate Structural PASS definition: " + definition.caseId());
            result.add(definition);
        }
        return List.copyOf(result);
    }

    private record Definition(String caseId, String baseCapabilityId, String controlCapabilityId, String variantKey, List<String> templateIds, String canonicalText) {
        String fixturePath() { return "golden/fixtures/" + caseId.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "") + ".json"; }
    }
}
