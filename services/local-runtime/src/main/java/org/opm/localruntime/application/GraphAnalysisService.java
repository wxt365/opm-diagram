package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftWorkspaceSchema;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.stereotype.Service;
import java.time.Clock;

@Service
public final class GraphAnalysisService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final ProjectDatabaseFactory databases;
    private final LocalApiService domain;
    public GraphAnalysisService(ProjectDatabaseFactory databases, LocalApiService domain) { this.databases = databases; this.domain = domain; }

    public JsonNode query(String project, String model, String revisionId, DraftWorkspaceContract.Document request) {
        DraftWorkspaceSchema.validate(JSON.valueToTree(project), "StableId");
        DraftWorkspaceSchema.validate(JSON.valueToTree(model), "StableId");
        var input = request.value(); ObjectNode document;
        if (revisionId == null) {
            var scope = databases.databaseScope(project);
            if (!scope.exists()) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
            var snapshot = new DraftJournalRepository(scope, Clock.systemUTC()).read(project, model);
            var token = input.get("draft_token");
            if (!token.path("binding_digest").asText().equals(snapshot.token().binding_digest()))
                throw new DraftWorkspaceService.Failure("RULE_VERSION_CONFLICT", null);
            if (!token.path("draft_id").asText().equals(snapshot.token().draft_id()) || token.path("edit_seq").longValue() != snapshot.token().edit_seq())
                throw new DraftWorkspaceService.Failure("DRAFT_CONFLICT", null);
            document = SaveContentDigestV1.read(snapshot.documentJson());
        } else {
            DraftWorkspaceSchema.validate(JSON.valueToTree(revisionId), "StableId");
            document = domain.transferDocument(project, model, revisionId);
        }
        var semantic = DraftWorkspaceService.semantic(document);
        if (revisionId == null && !semantic.profileBinding().equals(RuntimeActiveBindingProvider.current()))
            throw new DraftWorkspaceService.Failure("RULE_VERSION_CONFLICT", null);
        var result = GraphAnalysisProjector.project(semantic, input);
        var source = result.putObject("source").put("project_id", project).put("model_id", model)
                .put("request_id", input.path("request_id").asText()).put("context_id", input.path("context_id").asText())
                .put("scope", input.path("scope").asText()).put("binding", semantic.profileBinding().toString()).put("projection_version", 1);
        source.set("draft_token", input.has("draft_token") ? input.get("draft_token") : JSON.nullNode());
        source.put("revision_id", revisionId);
        return DraftWorkspaceContract.read(result.toString(), DraftWorkspaceContract.Type.GraphAnalysisResult).value();
    }

    public static final class LimitExceeded extends RuntimeException {
        public LimitExceeded() { super("图谱超过 2,000 个节点或 10,000 条边，请缩小分析范围。"); }
    }
}
