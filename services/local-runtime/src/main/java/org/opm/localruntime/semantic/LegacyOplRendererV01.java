package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 只重放不可变 0.1 Grammar 的 family-level OPL 文本，不产生 ACTIVE Token 或 Trace。 */
public final class LegacyOplRendererV01 {

    public static final String GRAMMAR_ID = "grammar.opl.iso19450.2024.draft";
    public static final String GRAMMAR_VERSION = "0.1.0";
    public static final String GRAMMAR_SHA256 = "be315186135f2cfa525128532220b289e083fa4bc70bacb33a4287331467a9d1";

    private final ObjectMapper objectMapper = new ObjectMapper();

    public boolean supports(SemanticRevision.AssetReference grammar) {
        return GRAMMAR_ID.equals(grammar.id())
                && GRAMMAR_VERSION.equals(grammar.version())
                && GRAMMAR_SHA256.equals(grammar.sha256());
    }

    public RenderedText render(SemanticRevision revision, Path grammarPath) {
        verifyGrammar(grammarPath, revision.profileBinding().textGrammar());
        Map<String, String> names = names(revision);
        List<String> sentences = new ArrayList<>();
        for (SemanticRevision.Element element : revision.elements()) {
            sentences.add(element.name().localName() + " is " + article(element.coreKind()) + ".");
        }
        for (SemanticRevision.Fact fact : revision.facts()) {
            sentences.add(factSentence(fact, names));
        }
        String text = String.join("\n", sentences);
        return new RenderedText(text, sha256(text.getBytes(StandardCharsets.UTF_8)));
    }

    private void verifyGrammar(Path grammarPath, SemanticRevision.AssetReference grammar) {
        if (!supports(grammar)) {
            throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_RENDERER_MISSING,
                    "No LegacyOplRendererV01 is registered for the historical Grammar binding");
        }
        try {
            byte[] bytes = Files.readAllBytes(grammarPath);
            if (!GRAMMAR_SHA256.equals(sha256(bytes))) {
                throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_DIGEST_MISMATCH,
                        "Historical Grammar bytes do not match the exact 0.1 binding");
            }
            JsonNode root = objectMapper.readTree(bytes);
            if (root == null || !GRAMMAR_ID.equals(root.path("asset_id").asText())
                    || !GRAMMAR_VERSION.equals(root.path("asset_version").asText())
                    || !hasMapping(root, "opl.object.declaration.v1")
                    || !hasMapping(root, "opl.process.declaration.v1")) {
                throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_DIGEST_MISMATCH,
                        "Historical Grammar does not have the immutable 0.1 shape");
            }
        } catch (IOException exception) {
            throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_MISSING,
                    "Historical Grammar cannot be read", exception);
        }
    }

    private boolean hasMapping(JsonNode root, String expected) {
        JsonNode mappings = root.path("mappings");
        if (!mappings.isArray()) return false;
        for (JsonNode mapping : mappings) if (expected.equals(mapping.asText())) return true;
        return false;
    }

    private Map<String, String> names(SemanticRevision revision) {
        Map<String, String> names = new HashMap<>();
        for (SemanticRevision.Element element : revision.elements()) names.put(element.id(), element.name().localName());
        for (SemanticRevision.Feature feature : revision.features()) names.put(feature.id(), feature.name().localName());
        for (SemanticRevision.State state : revision.states()) names.put(state.id(), state.name().localName());
        return names;
    }

    private String article(SemanticRevision.CoreKind coreKind) {
        return switch (coreKind) {
            case OBJECT -> "an object";
            case PROCESS -> "a process";
            case PROFILE_ELEMENT -> "a profile element";
        };
    }

    private String factSentence(SemanticRevision.Fact fact, Map<String, String> names) {
        List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream()
                .sorted(java.util.Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        String subject = endpoints.isEmpty() ? fact.id() : names.getOrDefault(endpoints.getFirst().targetId(), endpoints.getFirst().targetId());
        String object = endpoints.size() < 2 ? fact.id() : names.getOrDefault(endpoints.get(1).targetId(), endpoints.get(1).targetId());
        return subject + " " + verb(fact) + " " + object + ".";
    }

    private String verb(SemanticRevision.Fact fact) {
        String capability = fact.capability().capabilityId();
        if (capability.equals("CAP-ISO-PROC-001") || capability.equals("CAP-ISO-PROC-006")) return "is consumed by";
        if (capability.equals("CAP-ISO-PROC-002") || capability.equals("CAP-ISO-PROC-007")) return "yields";
        if (capability.startsWith("CAP-ISO-PROC-003") || capability.startsWith("CAP-ISO-PROC-008")
                || capability.startsWith("CAP-ISO-PROC-009") || capability.startsWith("CAP-ISO-PROC-010")) return "affects";
        if (capability.startsWith("CAP-ISO-PROC-004") || capability.startsWith("CAP-ISO-PROC-006")) return "enables";
        if (capability.startsWith("CAP-ISO-PROC-005") || capability.startsWith("CAP-ISO-PROC-008")) return "instruments";
        return fact.labels().isEmpty() ? "is related to" : fact.labels().getFirst().text();
    }

    private String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record RenderedText(String text, String textSha256) { }
}
