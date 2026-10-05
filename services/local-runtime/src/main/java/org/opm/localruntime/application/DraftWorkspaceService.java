package org.opm.localruntime.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftWorkspaceSchema;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.*;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.text.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.opm.localruntime.api.generated.DraftWorkspaceContract.Type.*;

/** 草稿 API 只访问已激活的 Journal 存储，不迁移、不提交旧 Revision。 */
@Service
public final class DraftWorkspaceService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final ProjectDatabaseFactory databases;
    private final LocalApiService domain;
    private final ProfilePackageAssembler profiles;
    private final Clock clock;
    private final DraftSaveService saves;
    private final DraftCapabilityQuery capabilityQuery;
    private final OplTextGenerationService text = new OplTextGenerationService();

    public static final class Failure extends RuntimeException {
        private final String code, reason;
        public Failure(String code, String reason) { super(code); this.code = code; this.reason = reason; }
        public String code() { return code; }
        public String reason() { return reason; }
    }

    public DraftWorkspaceService(ProjectDatabaseFactory databases, LocalApiService domain, FileProfilePackageLoader loader) {
        this(databases, domain, loader, Clock.systemUTC());
    }
    @Autowired
    public DraftWorkspaceService(ProjectDatabaseFactory databases, LocalApiService domain, FileProfilePackageLoader loader, DraftSaveService saves) {
        this(databases, domain, loader, Clock.systemUTC(), saves);
    }
    public DraftWorkspaceService(ProjectDatabaseFactory databases, LocalApiService domain, FileProfilePackageLoader loader, Clock clock) {
        this(databases, domain, loader, clock, null);
    }
    public DraftWorkspaceService(ProjectDatabaseFactory databases, LocalApiService domain, FileProfilePackageLoader loader, Clock clock, DraftSaveService saves) {
        this.databases = databases; this.domain = domain; this.profiles = new ProfilePackageAssembler(loader); this.clock = clock; this.saves = saves;
        this.capabilityQuery = new DraftCapabilityQuery(domain, profiles);
    }

    public JsonNode execute(String project, String model, DraftWorkspaceContract.Document request) {
        DraftWorkspaceSchema.validate(JSON.valueToTree(project), "StableId"); DraftWorkspaceSchema.validate(JSON.valueToTree(model), "StableId");
        var repository = repository(project); JsonNode input = request.value();
        if (request.type() == MindmapRequest) {
            require(databases.open(project) instanceof org.opm.localruntime.storage.ProjectDatabaseOpenResult.Ready, "PERSISTENCE_FAILED", null);
            return new org.opm.localruntime.storage.MindmapRepository(databases.databasePath(project), clock).execute(project, model, input);
        }
        if (request.type() == DraftModelPlanPreviewRequest) {
            if (input.has("analysis_source")) new org.opm.localruntime.storage.MindmapRepository(databases.databasePath(project), clock).check(project, model, input.get("analysis_source"));
            var snapshot = repository.read(project, model); var token = input.get("draft_token");
            require(sameToken(token, snapshot), "DRAFT_CONFLICT", null);
            var before = SaveContentDigestV1.read(snapshot.documentJson()); String context = input.get("context_id").asText();
            context(semantic(before), context);
            var built = modelPlan(project, model, context, input.get("plan_id").asText(), token, input.get("steps"), before);
            var revision = semantic(built.document());
            var result = JSON.createObjectNode();
            result.set("meta", envelope(input, context, JSON.createObjectNode()).get("meta"));
            result.set("data", projection(revision, built.document(), context)); result.putNull("capabilities"); result.putNull("findings");
            if (input.path("finalize").asBoolean(false)) {
                result.set("findings", planFindings(project, model, token, revision));
                if (input.has("analysis_source")) {
                    var analysis = new org.opm.localruntime.storage.MindmapRepository(databases.databasePath(project), clock).source(project, model, input.get("analysis_source"));
                    MindmapConversions.bind(analysis, input.get("analysis_source"), result.get("data"), built.aliases(), input.get("steps"));
                }
            }
            if (!input.get("next_scope").isNull()) {
                ObjectNode scope = input.get("next_scope").deepCopy();
                require(scope.path("context_id").asText().equals(context) && DraftModelPlan.TYPES.contains(scope.path("intent").asText()), "INPUT_INVALID", null);
                if (!scope.get("selection_id").isNull()) scope.put("selection_id", DraftModelPlan.resolve(scope.get("selection_id").asText(), built.aliases(), revision, context));
                var endpoints = JSON.createArrayNode();
                for (var endpoint : scope.get("endpoints")) endpoints.add(DraftModelPlan.resolve(endpoint.asText(), built.aliases(), revision, context));
                scope.set("endpoints", endpoints); result.set("capabilities", candidates(project, model, token, scope, revision));
            }
            return checked(result, DraftModelPlanPreviewResult);
        }
        if (request.type() == MethodSummaryRequest) {
            JsonNode source = input.get("source"); ObjectNode document;
            if (source.has("draft_token")) {
                var snapshot = repository.read(project, model); var token = source.get("draft_token");
                require(token.path("binding_digest").asText().equals(snapshot.token().binding_digest()), "RULE_VERSION_CONFLICT", null);
                require(sameToken(token, snapshot), "DRAFT_CONFLICT", "DRAFT_CONFLICT");
                document = SaveContentDigestV1.read(snapshot.documentJson());
            } else {
                try { document = domain.transferDocument(project, model, source.get("revision_id").asText()); }
                catch (org.opm.localruntime.api.ApiException exception) {
                    // 历史查询保留读取错误，避免进入旧草稿编辑错误映射。
                    throw failure(switch (exception.code()) {
                        case NOT_FOUND -> "NOT_FOUND";
                        case PERSISTENCE_FAILED -> "PERSISTENCE_FAILED";
                        case INVALID_ARGUMENT -> "INPUT_INVALID";
                        default -> "DRAFT_EDIT_REJECTED";
                    }, null);
                }
            }
            var revision = semantic(document); String context = input.get("context_id").asText(); context(revision, context);
            var result = JSON.createObjectNode();
            var meta = result.putObject("meta").put("request_id", input.get("request_id").asText()).put("context_id", context);
            meta.set("source", source); result.set("data", MethodSummaryQuery.summarize(revision));
            return checked(result, MethodSummaryResult);
        }
        if (request.type() == DraftEditRequest) {
            return repository.commit(project, model, request, document -> DraftOperationDescription.describe(input, document,
                    edit(project, model, input, document.deepCopy()))).value();
        }
        if (request.type() == DraftReceiptRequest) return repository.receipt(project, model, request).value();
        if (request.type() == OperationHistoryRequest) {
            var data = new org.opm.localruntime.storage.OperationHistoryRepository(databases.databasePath(project), clock)
                    .read(project, model, input.path("revision").asText(), input.path("before").isNull() ? null : input.path("before").asText());
            var meta = JSON.createObjectNode().put("request_id", input.path("request_id").asText()).put("project_id", project).put("model_id", model).put("revision", input.path("revision").asText());
            var result = JSON.createObjectNode(); result.set("meta", meta); result.set("data", data);
            return checked(result, OperationHistoryResult);
        }
        var snapshot = repository.read(project, model);
        ObjectNode document = SaveContentDigestV1.read(snapshot.documentJson()); var revision = semantic(document);
        if (request.type() == OpenDraftRequest) {
            String context = input.get("context_id").isNull() ? revision.rootContextId() : input.get("context_id").asText();
            context(revision, context);
            var result = JSON.createObjectNode().put("request_id", input.get("request_id").asText()).put("project_id", project).put("model_id", model)
                    .put("root_context_id", revision.rootContextId()).put("context_id", context).put("mode", "JOURNALED_DRAFT_V2");
            result.set("draft_token", JSON.valueToTree(snapshot.token()));
            var state = result.putObject("save_state"); state.set("durable_token", JSON.valueToTree(snapshot.token())); state.set("checkpoint_token", JSON.valueToTree(snapshot.checkpointToken()));
            state.put("last_manual_revision", snapshot.lastManualRevision()).put("dirty_since", snapshot.dirtySince()).put("deadline", snapshot.deadline())
                    .put("in_flight", "NONE").putNull("pending_manual_target").putNull("last_error");
            if (saves != null) {
                var current = saves.state(project, model);
                require(current.durable_token().equals(snapshot.token()), "DRAFT_CONFLICT", null);
                result.set("save_state", JSON.valueToTree(current));
            }
            return checked(result, OpenDraftResult);
        }
        JsonNode token = input.get("draft_token");
        if (!token.path("binding_digest").asText().equals(snapshot.token().binding_digest())) throw failure("RULE_VERSION_CONFLICT", null);
        if (!sameToken(token, snapshot)) throw failure("DRAFT_CONFLICT", "DRAFT_CONFLICT");
        String context = request.type() == DraftCapabilitiesRequest ? input.at("/scope/context_id").asText() : input.path("context_id").asText();
        context(revision, context);
        if (request.type() == DraftCapabilitiesRequest) return checked(envelope(input, context, candidates(project, model, token, input.get("scope"), revision)), DraftCapabilitiesResult);
        // 普通 DraftQueryRequest 的具体查询由 query() 分派，避免用调用顺序推断意图。
        throw failure("INPUT_INVALID", null);
    }

    public JsonNode query(String project, String model, String operation, DraftWorkspaceContract.Document request) {
        require(request.type() == (operation.equals("relation-catalog") ? DraftRelationCatalogRequest : DraftQueryRequest), "INPUT_INVALID", null);
        DraftWorkspaceSchema.validate(JSON.valueToTree(project), "StableId"); DraftWorkspaceSchema.validate(JSON.valueToTree(model), "StableId");
        var snapshot = repository(project).read(project, model); var input = request.value(); var token = input.get("draft_token");
        if (!token.path("binding_digest").asText().equals(snapshot.token().binding_digest())) throw failure("RULE_VERSION_CONFLICT", null);
        require(sameToken(token, snapshot), "DRAFT_CONFLICT", "DRAFT_CONFLICT");
        ObjectNode document = SaveContentDigestV1.read(snapshot.documentJson()); var revision = semantic(document); String context = input.get("context_id").asText(); context(revision, context);
        require(revision.profileBinding().equals(RuntimeActiveBindingProvider.current()), "RULE_VERSION_CONFLICT", null);
        var assets = profiles.assemble(revision.profileBinding());
        if (operation.equals("navigation")) return checked(envelope(input, context, DraftWorkspaceQueries.navigation(revision, context)), DraftNavigationResult);
        if (operation.equals("findings")) {
            var data = DraftModelValidation.findings(project, model, token, revision, assets);
            return checked(envelope(input, context, data), DraftFindingsResult);
        }
        if (operation.equals("relation-catalog")) return checked(envelope(input, context,
                DraftWorkspaceQueries.catalog(domain, revision, context, input.get("selection_id"), assets)), DraftRelationCatalogResult);
        if (operation.equals("projection")) {
            return checked(envelope(input, context, projection(revision, document, context)), DraftProjectionResult);
        }
        if (operation.equals("text")) {
            var generated = generate(revision, context);
            var data = JSON.createObjectNode().put("artifact_id", generated.artifact().artifactId()).put("modality", "OPL");
            var sentences = data.putArray("sentences");
            for (var paragraph : generated.artifact().paragraphs()) for (var sentence : paragraph.sentences())
                sentences.addObject().put("sentence_id", sentence.sentenceId()).put("text", sentence.text()).put("ordinal", sentence.ordinal());
            var traces = data.putArray("traces");
            for (var trace : generated.traces()) for (String sentence : trace.sentenceIds()) {
                var item = traces.addObject().put("sentence_id", sentence); item.set("fact_ids", JSON.valueToTree(trace.factIds())); item.set("occurrence_ids", JSON.valueToTree(trace.occurrenceIds()));
            }
            return checked(envelope(input, context, data), DraftTextResult);
        }
        throw failure("DRAFT_EDIT_REJECTED", "COMMAND_NOT_IMPLEMENTED");
    }

    private ObjectNode projection(SemanticRevision revision, ObjectNode document, String context) {
            ObjectNode data = JSON.valueToTree(domain.projectionData(revision, context));
            for (var construct : data.get("constructs")) {
                var occurrence = find(document.get("occurrences"), "occurrence_id", construct.get("occurrence_id").asText());
                var layout = find(document.get("layouts"), "layout_id", occurrence.get("layout_id").asText()).deepCopy(); layout.remove("layout_id");
                ((ObjectNode) construct).set("layout", layout);
                if (construct.has("endpoints")) {
                    var fact = find(document.get("facts"), "fact_id", construct.get("target_id").asText());
                    for (int i = 0; i < construct.get("endpoints").size(); i++) {
                        var endpoint = fact.get("endpoints").get(i);
                        if (endpoint.has("state_qualification_id")) ((ObjectNode) construct.get("endpoints").get(i)).set("state_qualification", endpoint.get("state_qualification_id"));
                    }
                }
            }
            return data;
    }

    private DraftModelPlan.Result modelPlan(String project, String model, String context, String planId, JsonNode token, JsonNode steps, ObjectNode document) {
        var built = DraftModelPlan.build(context, planId, token, steps, document,
                (scope, revision) -> candidates(project, model, token, scope, revision),
                (input, current) -> edit(project, model, input, current), this::guardPlanTarget);
        if (steps.isEmpty()) return built;
        var generated = generate(semantic(built.document()), semantic(document).rootContextId());
        DraftTextMetadataWriter.write(built.document(), generated);
        return new DraftModelPlan.Result(built.document(), new DraftJournalRepository.Proposal(built.document().toString(), built.proposal().affectedIds(),
                generated.traces().stream().map(OplTextTrace::traceId).toList(), built.proposal().validationSummaryJson()), built.aliases());
    }

    /** 对语义身份的修改不得通过整体方案扩大到其他图。 */
    private void guardPlanTarget(SemanticRevision revision, String context, String target) {
        require(revision.refinementEdges().stream().noneMatch(edge -> edge.refineeElementId().equals(target)), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
        for (var other : revision.contexts()) if (!other.id().equals(context)) {
            JsonNode projection = JSON.valueToTree(domain.projectionData(revision, other.id()));
            for (var construct : projection.path("constructs")) {
                if (construct.path("target_kind").asText().equals("FACT")) {
                    var fact = revision.facts().stream().filter(item -> item.id().equals(construct.path("target_id").asText())).findFirst().orElseThrow();
                    require(fact.endpoints().stream().noneMatch(endpoint -> target.equals(endpoint.stateQualificationId())), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
                }
                require(!construct.path("target_id").asText().equals(target) && !construct.path("owner_id").asText().equals(target), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
                for (var endpoint : construct.path("endpoints")) require(!endpoint.path("target_id").asText().equals(target)
                        && !endpoint.path("state_qualification").asText().equals(target), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
            }
            for (var suppressed : projection.path("suppressed_states")) require(!suppressed.path("state_id").asText().equals(target)
                    && !suppressed.at("/owner_ref/target_id").asText().equals(target), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
        }
    }

    private DraftJournalRepository.Proposal edit(String project, String model, JsonNode input, ObjectNode document) {
        String beforeDigest = SaveContentDigestV1.sha256(document);
        var base = semantic(document); JsonNode scope = input.get("scope"); context(base, scope.get("context_id").asText());
        String type = input.at("/command/command_type").asText();
        var options = candidates(project, model, input.get("expected_draft_token"), scope, base);
        require(options.get("capability_query_id").equals(input.at("/authorization/capability_query_id")), "DRAFT_EDIT_REJECTED", null);
        JsonNode chosen = null;
        for (var option : options.get("options")) if (option.get("option_id").equals(input.at("/authorization/selected_option_id"))) chosen = option;
        if (chosen == null) {
            String reason = options.get("forbidden").isEmpty() ? null : options.at("/forbidden/0/reason_code").asText();
            throw failure("DRAFT_EDIT_REJECTED", reason);
        }
        JsonNode payload = input.at("/command/payload");
        if (type.equals("APPLY_MODEL_PLAN")) {
            require(scope.get("selection_id").isNull() && scope.get("endpoints").isEmpty()
                    && payload.get("context_id").equals(scope.get("context_id")), "INPUT_INVALID", null);
            var built = modelPlan(project, model, scope.get("context_id").asText(), input.get("command_id").asText(), input.get("expected_draft_token"), payload.get("steps"), document);
            var findings = planFindings(project, model, input.get("expected_draft_token"), semantic(built.document()));
            require(findings.at("/validation_summary/blocking").asInt() == 0, "DRAFT_EDIT_REJECTED", null);
            String mappings = null;
            if (input.has("analysis_source")) {
                var analysis = new org.opm.localruntime.storage.MindmapRepository(databases.databasePath(project), clock).source(project, model, input.get("analysis_source"));
                mappings = MindmapConversions.bind(analysis, input.get("analysis_source"), projection(semantic(built.document()), built.document(), scope.get("context_id").asText()), built.aliases(), payload.get("steps"));
            }
            return new DraftJournalRepository.Proposal(built.proposal().documentJson(), built.proposal().affectedIds(), built.proposal().textTraceIds(), findings.get("validation_summary").toString(), null, mappings);
        }
        if (type.equals("UPDATE_ARCHITECTURE_CLASSIFICATION") || MethodArchitectureLinks.COMMANDS.contains(type)) {
            require(scope.path("intent").asText().equals(type) && scope.path("selection_id").isNull()
                    && scope.path("endpoints").isEmpty() && scope.get("context_id").equals(payload.get("context_id"))
                    && chosen.path("command_type").asText().equals(type)
                    && chosen.path("option_kind").asText().equals("METHOD_METADATA")
                    && chosen.get("target_context_id").equals(payload.get("context_id")), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
            return MethodArchitectureLinks.COMMANDS.contains(type) ? MethodArchitectureLinks.apply(document, type, payload) : MethodClassificationEdit.apply(document, payload);
        }
        if (type.equals("DELETE_CONTEXT")) {
            require(scope.get("intent").asText().equals(type) && scope.get("selection_id").equals(payload.get("context_id")),
                    "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            require(chosen.path("enabled").asBoolean(), "DRAFT_EDIT_REJECTED", "DELETE_DEPENDENCY_EXISTS");
            require(chosen.get("impact_token").equals(payload.get("impact_token")), "DRAFT_EDIT_REJECTED", "IMPACT_TOKEN_STALE");
            var affected = DraftContextDeletion.apply(document, DraftContextDeletion.plan(base, payload.get("context_id").asText()));
            require(new SemanticRevisionValidator().validate(semantic(document)).isEmpty(), "DRAFT_EDIT_REJECTED", null);
            var generated = generate(semantic(document), base.rootContextId()); DraftTextMetadataWriter.write(document, generated);
            return new DraftJournalRepository.Proposal(document.toString(), affected,
                    generated.traces().stream().map(OplTextTrace::traceId).toList(),
                    "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
        }
        if (type.equals("CREATE_ELEMENT")) require(chosen.at("/capability_ref/capability_id").asText().equals("CAP-" + payload.get("kind").asText() + "-001")
                && (payload.has("context_id") ? scope.get("context_id").equals(payload.get("context_id"))
                    : base.rootContextId().equals(scope.get("context_id").asText())), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
        else if (type.equals("UPDATE_PROPERTY")) require(
                chosen.at("/normalized_endpoints/0/target_ref/target_id").equals(payload.at("/target_ref/target_id"))
                        && chosen.at("/normalized_endpoints/0/target_ref/target_kind").equals(payload.at("/target_ref/target_kind")),
                "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        else if (type.equals("UPDATE_LAYOUT")) require(chosen.at("/normalized_endpoints/0/target_ref/occurrence_id").equals(payload.get("occurrence_id")), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        else if (type.equals("UPDATE_LAYOUT_BATCH")) {
            var targets = JSON.createArrayNode();
            for (var item : payload.get("layouts")) targets.add(item.get("occurrence_id"));
            require(scope.get("intent").asText().equals(type) && scope.get("endpoints").equals(targets), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        }
        else if (type.equals("CREATE_CONTEXT")) require(scope.get("context_id").equals(payload.get("context_id"))
                && chosen.at("/normalized_endpoints/0/target_ref/target_id").equals(payload.get("refinee_element_id")),
                "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        else if (DraftFactEdits.TYPES.contains(type)) DraftFactEdits.validate(base, scope, chosen, type, payload);
        else DraftCapabilityQuery.validateOwnedPayload(base, scope, chosen, type, payload);
        Map<String, Object> commandPayload = JSON.convertValue(payload, new TypeReference<Map<String, Object>>() { });
        var candidate = type.equals("CREATE_CONTEXT") ? domain.editDraftContext(base, commandPayload)
                : DraftFactEdits.TYPES.contains(type) ? domain.editDraftFact(base, type, commandPayload)
                : domain.editDraftElement(base, type, commandPayload);
        require(new SemanticRevisionValidator().validate(candidate).isEmpty(), "DRAFT_EDIT_REJECTED", null);
        var affected = new ArrayList<String>();
        if (type.equals("CREATE_ELEMENT")) {
            ObjectNode serialized = (ObjectNode) org.opm.localruntime.storage.DraftJsonDelta.read(new SemanticRevisionJsonWriter().write(candidate));
            for (String collection : List.of("elements", "occurrences", "layouts")) {
                var target = (ArrayNode) document.get(collection); var source = serialized.get(collection);
                for (int i = target.size(); i < source.size(); i++) target.add(source.get(i).deepCopy());
            }
            String contextId = scope.get("context_id").asText();
            var context = find(document.get("contexts"), "context_id", contextId);
            context.set("occurrence_ids", find(serialized.get("contexts"), "context_id", contextId).get("occurrence_ids"));
            affected.add(candidate.elements().getLast().id()); affected.add(candidate.occurrences().getLast().id());
        } else if (type.equals("CREATE_CONTEXT")) {
            ObjectNode serialized = (ObjectNode) org.opm.localruntime.storage.DraftJsonDelta.read(new SemanticRevisionJsonWriter().write(candidate));
            if (!List.of("0.4", "0.5").contains(document.path("schema_version").asText())) document.put("schema_version", "0.3");
            ((ArrayNode) document.get("contexts")).add(serialized.get("contexts").get(serialized.get("contexts").size() - 1).deepCopy());
            if (!document.has("refinement_edges")) document.putArray("refinement_edges");
            ((ArrayNode) document.get("refinement_edges")).add(serialized.get("refinement_edges").get(serialized.get("refinement_edges").size() - 1).deepCopy());
            affected.add(candidate.contexts().getLast().id()); affected.add(candidate.refinementEdges().getLast().id());
        } else if (type.equals("UPDATE_PROPERTY")) {
            String id = payload.at("/target_ref/target_id").asText();
            boolean feature = payload.at("/target_ref/target_kind").asText().equals("FEATURE");
            JsonNode collection = document.get(feature ? "features" : "elements");
            String idField = feature ? "feature_id" : "element_id";
            ((ObjectNode) find(collection, idField, id).get("name")).set("local_name", payload.get("value")); affected.add(id);
        } else if (type.equals("UPDATE_LAYOUT") || type.equals("UPDATE_LAYOUT_BATCH")) {
            if (type.equals("UPDATE_LAYOUT")) affected.add(payload.get("occurrence_id").asText());
            DraftOwnedConstructEdits.syncLayoutGeometry(document, base, candidate, affected);
        } else if (DraftFactEdits.TYPES.contains(type)) affected.addAll(DraftFactEdits.apply(document, candidate, type, payload));
        else affected.addAll(DraftOwnedConstructEdits.apply(document, base, candidate, type, payload));
        String summary = "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}";
        if (SaveContentDigestV1.sha256(document).equals(beforeDigest)) return new DraftJournalRepository.Proposal(document.toString(), List.of(), List.of(), summary);
        var generated = generate(semantic(document), base.rootContextId()); DraftTextMetadataWriter.write(document, generated);
        return new DraftJournalRepository.Proposal(document.toString(), affected, generated.traces().stream().map(OplTextTrace::traceId).toList(), summary);
    }

    private ObjectNode candidates(String project, String model, JsonNode token, JsonNode scope, SemanticRevision revision) {
        return capabilityQuery.candidates(project, model, token, scope, revision);
    }

    private OplGenerationResult generate(SemanticRevision revision, String context) {
        var assets = profiles.assemble(revision.profileBinding()); var result = text.generate(revision, context, assets);
        text.validateActiveWriteEvidence(revision, assets, result); return result;
    }
    private ObjectNode planFindings(String project, String model, JsonNode token, SemanticRevision revision) {
        return DraftModelValidation.findings(project, model, token, revision, profiles.assemble(revision.profileBinding()));
    }
    private DraftJournalRepository repository(String project) {
        var path = databases.databasePath(project); require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS), "NOT_FOUND", null);
        return new DraftJournalRepository(path, clock);
    }
    static SemanticRevision semantic(ObjectNode document) {
        try { return DraftSemanticView.read(document); }
        catch (IllegalArgumentException exception) { throw failure("DRAFT_EDIT_REJECTED", null); }
    }
    private static void context(SemanticRevision revision, String id) { require(revision.contexts().stream().anyMatch(item -> item.id().equals(id)), "NOT_FOUND", null); }
    private static ObjectNode find(JsonNode values, String field, String id) {
        for (var value : values) if (value.path(field).asText().equals(id)) return (ObjectNode) value;
        throw failure("DRAFT_RECOVERY_REQUIRED", null);
    }
    private static ObjectNode envelope(JsonNode input, String context, JsonNode data) {
        var result = JSON.createObjectNode(); var meta = result.putObject("meta").put("request_id", input.get("request_id").asText()).put("context_id", context);
        meta.set("draft_token", input.get("draft_token")); result.set("data", data); return result;
    }
    private static JsonNode checked(JsonNode value, DraftWorkspaceContract.Type type) { return DraftWorkspaceContract.read(value.toString(), type).value(); }
    private static boolean sameToken(JsonNode token, DraftJournalRepository.Snapshot snapshot) {
        return token.get("draft_id").asText().equals(snapshot.token().draft_id()) && token.get("edit_seq").longValue() == snapshot.token().edit_seq()
                && token.get("binding_digest").asText().equals(snapshot.token().binding_digest());
    }
    private static Failure failure(String code, String reason) { return new Failure(code, reason); }
    private static void require(boolean condition, String code, String reason) { if (!condition) throw failure(code, reason); }
}
