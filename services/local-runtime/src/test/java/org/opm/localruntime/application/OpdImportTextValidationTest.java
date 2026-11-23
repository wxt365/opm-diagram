package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.root;

class OpdImportTextValidationTest {
    @Test void identifiesTheSubgraphAndFactThatPreventImport() throws Exception {
        var document = SaveContentDigestV1.read(Files.readString(root().resolve(
                "packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-005-instrument-object-pass.json")));
        ((ObjectNode) document.at("/facts/0/endpoints/0")).put("target_id", "element.processing");
        ((ObjectNode) document.at("/contexts/0/name")).put("local_name", "计算分产品收入");
        var revision = DraftSemanticView.read(document);
        var assets = new ProfilePackageAssembler(new FileProfilePackageLoader(root().resolve("packages/profiles")))
                .assemble(revision.profileBinding());
        var failure = assertThrows(ApiException.class, () -> OpdJsonPackage.validateText(revision, assets));
        assertEquals(ApiErrorCode.TEXT_GENERATION_BLOCKED, failure.code());
        assertEquals(422, failure.status());
        assertTrue(failure.getMessage().contains("计算分产品收入"));
        assertTrue(failure.getMessage().contains("ENDPOINT_KIND_MISMATCH"));
        assertTrue(failure.getMessage().contains("fact.g-opl-proc-005-instrument-object-pass"));
    }
}
