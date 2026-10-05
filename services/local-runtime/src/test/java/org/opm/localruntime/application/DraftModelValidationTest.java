package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.opm.localruntime.api.DraftWorkspaceSchema;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class DraftModelValidationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test void supportedGoldenRelationsAndControlsHaveNoFalsePositivesInRootAndChild() throws Exception {
        int checked = 0; var capabilities = new java.util.HashSet<String>();
        try (var files = Files.list(directory())) {
            for (var file : files.filter(item -> item.getFileName().toString().endsWith("-pass.json")).sorted().toList()) {
                var document = SaveContentDigestV1.read(Files.readString(file));
                if (document.path("facts").size() != 1) continue;
                if (!new org.opm.localruntime.semantic.SemanticRevisionValidator().validate(DraftSemanticView.read(document)).isEmpty()) continue;
                addOwnedContext(document, "context.child", "MODEL_VIEW");
                // 夹具共享一个状态布局，辅助函数复制后需要消除完全相同的布局项。
                var layouts = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts");
                var seen = new java.util.HashSet<String>();
                for (int i = layouts.size() - 1; i >= 0; i--) if (!seen.add(layouts.get(i).get("layout_id").asText())) layouts.remove(i);
                var result = validate(document);
                assertTrue(result.get("items").isEmpty(), file.getFileName() + ": " + result);
                assertEquals("INCOMPLETE", result.at("/validation_summary/coverage_state").asText());
                capabilities.add(document.at("/facts/0/capability_ref/capability_id").asText());
                for (var modifier : document.at("/facts/0/modifiers")) if (modifier.path("modifier_id").asText().equals("control.capability")) capabilities.add(modifier.get("value").asText());
                checked++;
            }
        }
        assertTrue(checked >= 34, "应覆盖全部过程、控制和结构关系");
        for (var family : List.of("PROC", "CTRL", "STRUCT")) for (int i = 1; i <= (family.equals("PROC") ? 16 : family.equals("CTRL") ? 8 : 10); i++)
            assertTrue(capabilities.contains("CAP-ISO-" + family + "-" + String.format("%03d", i)), family + " " + i);
        System.out.println("模型校验回归：" + checked + " 个有效黄金夹具，覆盖 34 项关系和控制能力及根图/子图。");
    }

    @ParameterizedTest
    @ValueSource(strings = {"008", "009", "010"})
    void detectsCrossObjectStateChangeWithoutChangingDocument(String capability) throws Exception {
        String name = switch (capability) { case "008" -> "effect-input-output-state"; case "009" -> "effect-input-state"; default -> "effect-output-state"; };
        var document = fixture("g-opl-proc-" + capability + "-" + name + "-pass.json");
        var object = ((ObjectNode) document.at("/elements/0")).deepCopy().put("element_id", "element.other");
        object.put("core_kind", "OBJECT"); object.putArray("state_ids"); ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("elements")).add(object);
        var endpoint = document.at(capability.equals("009") ? "/facts/0/endpoints/0" : "/facts/0/endpoints/2");
        String state = endpoint.get("target_id").asText();
        for (var value : document.get("states")) if (value.get("state_id").asText().equals(state)) ((ObjectNode) value).put("owner_element_id", "element.other");
        for (var element : document.get("elements")) {
            var states = (com.fasterxml.jackson.databind.node.ArrayNode) element.get("state_ids");
            for (int i = states.size() - 1; i >= 0; i--) if (states.get(i).asText().equals(state)) states.remove(i);
        }
        ((com.fasterxml.jackson.databind.node.ArrayNode) object.get("state_ids")).add(state);
        var before = document.deepCopy(); var result = validate(document);
        assertTrue(java.util.stream.StreamSupport.stream(result.get("items").spliterator(), false)
                .anyMatch(item -> item.get("rule_id").asText().equals("rule.model.STATE_OWNER_MISMATCH")), result.toString());
        assertEquals(before, document);
    }

    @Test void reportsMultipleInvalidRelationsAndPreservesStableIdsAcrossQueries() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        addOwnedContext(document, "context.child", "MODEL_VIEW");
        var original = (ObjectNode) document.at("/facts/0");
        var second = original.deepCopy().put("fact_id", "fact.second");
        for (var endpoint : second.get("endpoints")) ((ObjectNode) endpoint).put("endpoint_id", "second." + endpoint.get("endpoint_id").asText());
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("facts")).add(second);
        for (var occurrence : document.get("occurrences")) if (occurrence.get("context_id").asText().equals("context.child") && occurrence.get("target_kind").asText().equals("FACT"))
            ((ObjectNode) occurrence).put("target_id", "fact.second");
        for (var fact : List.of(original, second)) {
            var modifiers = fact.putArray("modifiers");
            modifiers.addObject().put("modifier_id", "control.capability").put("value", "CAP-ISO-CTRL-007");
            modifiers.addObject().put("modifier_id", "control.segment").put("value", "PROCESS_INPUT");
        }
        var before = document.deepCopy(); var result = validate(document);
        assertEquals(2, result.get("items").size(), result.toString());
        assertEquals(2, result.at("/validation_summary/blocking").asInt());
        assertTrue(result.toString().contains("fact.second"));
        assertEquals(result, validate(document)); assertEquals(before, document);
    }

    private ObjectNode validate(ObjectNode document) {
        var revision = DraftSemanticView.read(document);
        var assets = new ProfilePackageAssembler(new FileProfilePackageLoader(root().resolve("packages/profiles"))).assemble(revision.profileBinding());
        var token = json.createObjectNode().put("draft_id", "draft.test").put("edit_seq", 0).put("binding_digest", revision.profileBinding().bindingDigest());
        var result = DraftModelValidation.findings(PROJECT, MODEL, token, revision, assets);
        DraftWorkspaceSchema.validate(result, "DraftFindingsData"); return result;
    }
    private java.nio.file.Path directory() { return root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures"); }
    private ObjectNode fixture(String filename) throws Exception { return SaveContentDigestV1.read(Files.readString(directory().resolve(filename))); }
}
