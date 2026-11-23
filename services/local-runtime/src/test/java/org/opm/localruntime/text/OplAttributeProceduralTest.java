package org.opm.localruntime.text;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.root;

class OplAttributeProceduralTest {
    private final OplTextGenerationService service = new OplTextGenerationService();

    @ParameterizedTest
    @ValueSource(strings = {
        "g-opl-proc-001-consumption-object-pass.json", "g-opl-proc-002-result-object-pass.json",
        "g-opl-proc-003-effect-object-pass.json", "g-opl-proc-005-instrument-object-pass.json",
        "g-opl-proc-006-consumption-state-pass.json", "g-opl-proc-007-result-state-pass.json",
        "g-opl-proc-008-effect-input-output-state-pass.json", "g-opl-proc-009-effect-input-state-pass.json",
        "g-opl-proc-010-effect-output-state-pass.json", "g-opl-proc-012-instrument-state-pass.json",
        "g-opl-ctrl-002-instrument-pass.json", "g-opl-ctrl-007-effect-input-output-pass.json",
        "g-opl-ctrl-008-instrument-state-pass.json"
    })
    void preservesAttributeIdentityAndOwnerThroughProceduralTextAndActiveTrace(String file) throws Exception {
        var document = attributeFixture(file);
        var revision = DraftSemanticView.read(document);
        assertTrue(new SemanticRevisionValidator().validate(revision).isEmpty());
        var assets = new ProfilePackageAssembler(new FileProfilePackageLoader(root().resolve("packages/profiles")))
                .assemble(revision.profileBinding());
        var result = service.generate(revision, revision.rootContextId(), assets);
        service.validateActiveWriteEvidence(revision, assets, result);
        var text = result.artifact().paragraphs().get(0).sentences().get(0).text();
        assertTrue(text.contains("基准净ASP"), text);
        assertTrue(result.traces().get(0).inputElementIds().contains(document.at("/features/0/owner_element_id").asText()));
        assertTrue(result.traces().get(0).sourceRefs().stream().anyMatch(ref ->
                ref.sourceKind() == OplToken.SourceKind.FEATURE && ref.stableId().equals("feature.attribute")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"operation", "missing-owner", "process-role"})
    void rejectsFeaturesThatCannotServeAsAttributeValues(String fault) throws Exception {
        var document = attributeFixture("g-opl-proc-005-instrument-object-pass.json");
        var feature = (ObjectNode) document.at("/features/0");
        if (fault.equals("operation")) feature.put("feature_kind", "OPERATION");
        if (fault.equals("missing-owner")) feature.put("owner_element_id", "element.missing");
        if (fault.equals("process-role")) for (var endpoint : document.at("/facts/0/endpoints"))
            if (endpoint.path("role").asText().equals("ENABLED_PROCESS"))
                ((ObjectNode) endpoint).put("target_kind", "FEATURE").put("target_id", "feature.attribute");
        var revision = DraftSemanticView.read(document);
        var assets = new ProfilePackageAssembler(new FileProfilePackageLoader(root().resolve("packages/profiles")))
                .assemble(revision.profileBinding());
        assertEquals(OplGenerationCode.ENDPOINT_KIND_MISMATCH, assertThrows(OplGenerationException.class,
                () -> service.generate(revision, revision.rootContextId(), assets)).code());
    }

    private ObjectNode attributeFixture(String file) throws Exception {
        var document = SaveContentDigestV1.read(Files.readString(root().resolve(
                "packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/" + file)));
        ObjectNode owner = null;
        for (var element : document.path("elements")) if (element.path("core_kind").asText().equals("OBJECT")) {
            owner = (ObjectNode) element; break;
        }
        assertNotNull(owner);
        String ownerId = owner.path("element_id").asText();
        var feature = owner.deepCopy();
        feature.remove(List.of("element_id", "core_kind", "feature_ids", "state_ids"));
        feature.put("feature_id", "feature.attribute").put("owner_element_id", ownerId).put("feature_kind", "ATTRIBUTE");
        ((ObjectNode) feature.path("name")).put("local_name", "基准净ASP");
        ((ObjectNode) feature.path("capability_ref")).put("capability_id", "CAP-FEAT-ATTRIBUTE-001");
        document.withArray("features").add(feature);
        owner.withArray("feature_ids").add("feature.attribute");
        owner.putArray("state_ids");
        for (var state : document.path("states")) if (state.path("owner_element_id").asText().equals(ownerId))
            ((ObjectNode) state).put("owner_target_kind", "FEATURE").put("owner_element_id", "feature.attribute");
        for (var fact : document.path("facts")) for (var endpoint : fact.path("endpoints"))
            if (endpoint.path("target_id").asText().equals(ownerId))
                ((ObjectNode) endpoint).put("target_kind", "FEATURE").put("target_id", "feature.attribute");
        var additions = new ArrayList<ObjectNode>();
        for (var occurrence : document.path("occurrences")) {
            if (occurrence.path("target_id").asText().equals(ownerId)) {
                var added = ((ObjectNode) occurrence).deepCopy();
                String id = added.path("occurrence_id").asText() + ".attribute";
                added.put("occurrence_id", id).put("target_kind", "FEATURE").put("target_id", "feature.attribute")
                        .put("construct_role", "ATTRIBUTE_NODE");
                additions.add(added);
                for (var context : document.path("contexts"))
                    if (context.path("context_id").equals(added.path("context_id"))) ((ObjectNode) context).withArray("occurrence_ids").add(id);
            } else if (occurrence.path("target_kind").asText().equals("STATE"))
                ((ObjectNode) occurrence).put("construct_role", "FEATURE_STATE_NODE");
        }
        additions.forEach(document.withArray("occurrences")::add);
        return document;
    }
}
