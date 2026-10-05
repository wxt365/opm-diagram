package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import org.opm.localruntime.storage.DraftJournalRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** 架构关联是显式方法记录；不按细化、分类或名称推断语言事实。 */
final class MethodArchitectureLinks {
    static final Set<String> COMMANDS = Set.of("CREATE_ARCHITECTURE_LINK", "DELETE_ARCHITECTURE_LINK");

    static DraftJournalRepository.Proposal apply(ObjectNode document, String command, JsonNode payload) {
        String current = payload.required("context_id").asText();
        ObjectNode source = context(document, current);
        if (source == null) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
        String before = SaveContentDigestV1.sha256(document), linkId, other;
        if (command.equals("CREATE_ARCHITECTURE_LINK")) {
            other = payload.required("target_context_id").asText();
            if (context(document, other) == null) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
            if (current.equals(other)) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
            String kind = payload.required("kind").asText();
            for (var link : source.path("architecture_links"))
                if (link.path("target_context_id").asText().equals(other) && link.path("kind").asText().equals(kind))
                    return proposal(document, List.of());
            linkId = "architecture.link." + UUID.randomUUID().toString().replace("-", "");
            source.withArray("architecture_links").addObject().put("link_id", linkId).put("target_context_id", other).put("kind", kind);
            document.put("schema_version", "0.5");
            if (!document.has("refinement_edges")) document.putArray("refinement_edges");
        } else {
            linkId = payload.required("link_id").asText(); other = null;
            for (var owner : document.required("contexts")) if (owner.get("architecture_links") instanceof ArrayNode links)
                for (int index = 0; index < links.size(); index++) if (links.get(index).path("link_id").asText().equals(linkId)) {
                    String from = owner.required("context_id").asText(), to = links.get(index).required("target_context_id").asText();
                    if (!current.equals(from) && !current.equals(to)) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
                    other = current.equals(from) ? to : from; links.remove(index);
                    if (links.isEmpty()) ((ObjectNode) owner).remove("architecture_links");
                    break;
                }
            if (other == null) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
        }
        if (!new SemanticRevisionValidator().validate(DraftSemanticView.read(document)).isEmpty())
            throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", null);
        return proposal(document, before.equals(SaveContentDigestV1.sha256(document)) ? List.of() : List.of(current, other, linkId));
    }

    private static ObjectNode context(ObjectNode document, String id) {
        for (var context : document.required("contexts")) if (context.path("context_id").asText().equals(id)) return (ObjectNode) context;
        return null;
    }
    private static DraftJournalRepository.Proposal proposal(ObjectNode document, List<String> affected) {
        return new DraftJournalRepository.Proposal(document.toString(), affected, List.of(),
                "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
    }
}
