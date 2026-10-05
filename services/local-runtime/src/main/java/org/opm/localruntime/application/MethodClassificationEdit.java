package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.storage.DraftJournalRepository;
import java.util.List;

/** 方法元数据只修改当前 OPD，不改语言关系、布局或派生文本。 */
final class MethodClassificationEdit {
    static DraftJournalRepository.Proposal apply(ObjectNode document, JsonNode payload) {
        String id = payload.required("context_id").asText();
        ObjectNode target = null;
        for (var context : document.required("contexts")) if (context.required("context_id").asText().equals(id)) target = (ObjectNode) context;
        if (target == null) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
        var level = payload.required("architecture_level");
        String before = SaveContentDigestV1.sha256(document);
        if (level.isNull()) target.remove("architecture_level");
        else {
            target.set("architecture_level", level.deepCopy());
            if (!document.path("schema_version").asText().equals("0.5")) document.put("schema_version", "0.4");
            if (!document.has("refinement_edges")) document.putArray("refinement_edges");
        }
        boolean unchanged = SaveContentDigestV1.sha256(document).equals(before);
        return new DraftJournalRepository.Proposal(document.toString(), unchanged ? List.of() : List.of(id), List.of(),
                "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
    }
}
