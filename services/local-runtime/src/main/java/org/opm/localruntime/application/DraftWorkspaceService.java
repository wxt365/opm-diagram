package org.opm.localruntime.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftCapabilityIdentity;
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
    private static final List<String> SUPPORTED = List.of("CREATE_ELEMENT", "UPDATE_PROPERTY", "UPDATE_LAYOUT",
            "CREATE_FEATURE", "CREATE_STATE", "UPDATE_STATE", "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD", "CREATE_FACT", "UPDATE_FACT", "DELETE_CONSTRUCT");
    private final ProjectDatabaseFactory databases;
    private final LocalApiService domain;
    private final ProfilePackageAssembler profiles;
    private final Clock clock;
    private final DraftSaveService saves;
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
    }

    public JsonNode execute(String project, String model, DraftWorkspaceContract.Document request) {
        DraftWorkspaceSchema.validate(JSON.valueToTree(project), "StableId"); DraftWorkspaceSchema.validate(JSON.valueToTree(model), "StableId");
        var repository = repository(project); JsonNode input = request.value();
        if (request.type() == DraftEditRequest) {
            return repository.commit(project, model, request, document -> edit(project, model, input, document)).value();
        }
        if (request.type() == DraftReceiptRequest) return repository.receipt(project, model, request).value();
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
            var data = DraftWorkspaceQueries.findings(project, model, token, revision);
            if (data.get("items").isEmpty()) generate(revision, context);
            return checked(envelope(input, context, data), DraftFindingsResult);
        }
        if (operation.equals("relation-catalog")) return checked(envelope(input, context,
                DraftWorkspaceQueries.catalog(domain, revision, context, input.get("selection_id"), assets)), DraftRelationCatalogResult);
        if (operation.equals("projection")) {
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
            return checked(envelope(input, context, data), DraftProjectionResult);
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
        if (type.equals("CREATE_ELEMENT")) require(chosen.at("/capability_ref/capability_id").asText().equals("CAP-" + payload.get("kind").asText() + "-001"), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        else if (type.equals("UPDATE_PROPERTY")) require(chosen.at("/normalized_endpoints/0/target_ref/target_id").equals(payload.at("/target_ref/target_id")), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        else if (type.equals("UPDATE_LAYOUT")) require(chosen.at("/normalized_endpoints/0/target_ref/occurrence_id").equals(payload.get("occurrence_id")), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        else if (DraftFactEdits.TYPES.contains(type)) DraftFactEdits.validate(base, scope, chosen, type, payload);
        else validateOwnedPayload(base, scope, chosen, type, payload);
        Map<String, Object> commandPayload = JSON.convertValue(payload, new TypeReference<Map<String, Object>>() { });
        var candidate = DraftFactEdits.TYPES.contains(type) ? domain.editDraftFact(base, type, commandPayload) : domain.editDraftElement(base, type, commandPayload);
        require(new SemanticRevisionValidator().validate(candidate).isEmpty(), "DRAFT_EDIT_REJECTED", null);
        var affected = new ArrayList<String>();
        if (type.equals("CREATE_ELEMENT")) {
            ObjectNode serialized = (ObjectNode) org.opm.localruntime.storage.DraftJsonDelta.read(new SemanticRevisionJsonWriter().write(candidate));
            for (String collection : List.of("elements", "occurrences", "layouts")) {
                var target = (ArrayNode) document.get(collection); var source = serialized.get(collection);
                for (int i = target.size(); i < source.size(); i++) target.add(source.get(i).deepCopy());
            }
            var context = find(document.get("contexts"), "context_id", base.rootContextId());
            context.set("occurrence_ids", find(serialized.get("contexts"), "context_id", base.rootContextId()).get("occurrence_ids"));
            affected.add(candidate.elements().getLast().id()); affected.add(candidate.occurrences().getLast().id());
        } else if (type.equals("UPDATE_PROPERTY")) {
            String id = payload.at("/target_ref/target_id").asText();
            ((ObjectNode) find(document.get("elements"), "element_id", id).get("name")).set("local_name", payload.get("value")); affected.add(id);
        } else if (type.equals("UPDATE_LAYOUT")) {
            affected.add(payload.get("occurrence_id").asText());
            DraftOwnedConstructEdits.syncLayoutGeometry(document, base, candidate, affected);
        } else if (DraftFactEdits.TYPES.contains(type)) affected.addAll(DraftFactEdits.apply(document, candidate, type, payload));
        else affected.addAll(DraftOwnedConstructEdits.apply(document, base, candidate, type, payload));
        String summary = "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}";
        if (SaveContentDigestV1.sha256(document).equals(beforeDigest)) return new DraftJournalRepository.Proposal(document.toString(), List.of(), List.of(), summary);
        var generated = generate(semantic(document), base.rootContextId()); DraftTextMetadataWriter.write(document, generated);
        return new DraftJournalRepository.Proposal(document.toString(), affected, generated.traces().stream().map(OplTextTrace::traceId).toList(), summary);
    }

    private ObjectNode candidates(String project, String model, JsonNode token, JsonNode scope, SemanticRevision revision) {
        require(revision.profileBinding().equals(RuntimeActiveBindingProvider.current()), "RULE_VERSION_CONFLICT", null);
        var assets = profiles.assemble(revision.profileBinding()); String intent = scope.get("intent").asText(); String context = scope.get("context_id").asText();
        String query = DraftCapabilityIdentity.query(project, model, token, scope);
        var data = JSON.createObjectNode(); data.set("scope", scope); var allowed = data.putArray("allowed"); var forbidden = data.putArray("forbidden");
        data.put("capability_query_id", query); var options = data.putArray("options");
        String selection = scope.get("selection_id").isNull() ? null : scope.get("selection_id").asText();
        String reason = !SUPPORTED.contains(intent) ? "COMMAND_NOT_IMPLEMENTED" : !revision.rootContextId().equals(context) ? "CONTEXT_NOT_ALLOWED"
                : !DraftFactEdits.TYPES.contains(intent) && !scope.get("endpoints").isEmpty() ? "ENDPOINT_KIND_MISMATCH" : null;
        if (DraftFactEdits.TYPES.contains(intent)) {
            if (intent.equals("DELETE_CONSTRUCT") && revision.contexts().size() != 1) reason = "CONTEXT_NOT_ALLOWED";
            if (reason == null) {
                OplGenerationResult generated = null;
                if (intent.equals("DELETE_CONSTRUCT")) {
                    require(new SemanticRevisionValidator().validate(revision).isEmpty(), "DRAFT_EDIT_REJECTED", null);
                    generated = generate(revision, context);
                }
                options.addAll(DraftFactEdits.options(domain, revision, scope, token, query, assets, generated));
                if (options.isEmpty()) reason = "ENDPOINT_KIND_MISMATCH";
                else for (var option : options) if (option.get("enabled").asBoolean()) { allowed.add(intent); break; }
            }
            if (reason != null) forbidden.addObject().put("command_type", intent).put("reason_code", reason);
            return data;
        }
        var occurrence = revision.occurrences().stream().filter(item -> item.contextId().equals(context) && item.id().equals(selection)).findFirst().orElse(null);
        String target = occurrence == null ? selection : occurrence.targetId();
        var element = revision.elements().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
        if (reason == null) switch (intent) {
            case "CREATE_ELEMENT" -> {
                if (selection != null) reason = "ENDPOINT_KIND_MISMATCH";
                else for (String kind : List.of("OBJECT", "PROCESS")) options.add(option(query, token, intent, "CAP-" + kind + "-001", null, null, null, assets));
            }
            case "UPDATE_PROPERTY" -> {
                boolean visible = element != null && (element.coreKind() == SemanticRevision.CoreKind.OBJECT || element.coreKind() == SemanticRevision.CoreKind.PROCESS)
                        && revision.occurrences().stream().anyMatch(item -> item.contextId().equals(context) && item.targetId().equals(element.id()) && item.targetKind() == SemanticRevision.TargetKind.ELEMENT);
                if (!visible) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent, element.capability().capabilityId(), "ELEMENT", element.id(), null, assets));
            }
            case "UPDATE_LAYOUT" -> {
                if (occurrence == null || !domain.draftLayoutAllowed(revision, selection)) reason = "ENDPOINT_KIND_MISMATCH";
                else {
                    String capability = occurrence.targetKind() == SemanticRevision.TargetKind.ELEMENT ? element.capability().capabilityId()
                            : occurrence.targetKind() == SemanticRevision.TargetKind.STATE
                            ? revision.states().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow().capability().capabilityId()
                            : revision.features().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow().capability().capabilityId();
                    options.add(option(query, token, intent, capability, occurrence.targetKind().name(), target, occurrence.id(), assets));
                }
            }
            case "CREATE_FEATURE" -> {
                if (element == null || !visible(revision, context, "ELEMENT", target)) reason = "ENDPOINT_KIND_MISMATCH";
                else for (String kind : List.of("ATTRIBUTE", "OPERATION"))
                    options.add(option(query, token, intent, "CAP-FEAT-" + kind + "-001", "ELEMENT", target, occurrence == null ? null : occurrence.id(), assets));
            }
            case "CREATE_STATE" -> {
                var feature = revision.features().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
                String kind = element != null && element.coreKind() == SemanticRevision.CoreKind.OBJECT ? "ELEMENT" : feature != null ? "FEATURE" : null;
                if (kind == null || !visible(revision, context, kind, target)) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent, kind.equals("ELEMENT") ? "CAP-STATE-001" : "CAP-FEAT-STATE-001", kind, target, occurrence == null ? null : occurrence.id(), assets));
            }
            case "UPDATE_STATE", "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD" -> {
                var state = revision.states().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
                boolean suppressed = state != null && occurrence == null && revision.statePresentations().stream().anyMatch(item -> item.contextId().equals(context)
                        && item.stateId().equals(target) && item.explicitness() == SemanticRevision.StateExplicitness.SUPPRESSED)
                        && visible(revision, context, state.ownerTargetKind().name(), state.ownerElementId());
                if (state == null || !(visible(revision, context, "STATE", target) || suppressed)) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent, state.capability().capabilityId(), "STATE", target, occurrence == null ? null : occurrence.id(), assets));
            }
            default -> throw failure("DRAFT_EDIT_REJECTED", "COMMAND_NOT_IMPLEMENTED");
        }
        if (reason != null) forbidden.addObject().put("command_type", intent).put("reason_code", reason);
        else if (!options.isEmpty()) allowed.add(intent);
        return data;
    }

    private ObjectNode option(String query, JsonNode token, String type, String capability, String targetKind, String target, String occurrence, TextGenerationAssets assets) {
        String symbol = switch (capability) {
            case "CAP-OBJECT-001" -> "symbol.object.basic";
            case "CAP-PROCESS-001" -> "symbol.process.basic";
            case "CAP-FEAT-ATTRIBUTE-001" -> "symbol.feature.attribute";
            case "CAP-FEAT-OPERATION-001" -> "symbol.feature.operation";
            case "CAP-STATE-001" -> "symbol.state.basic";
            case "CAP-FEAT-STATE-001" -> "symbol.feature.state";
            default -> throw failure("DRAFT_EDIT_REJECTED", "PROFILE_CAPABILITY_DISABLED");
        };
        require(assets.symbolCatalog().containsSymbol(symbol), "DRAFT_EDIT_REJECTED", "SYMBOL_ASSET_MISSING");
        var option = JSON.createObjectNode().put("capability_query_id", query).put("command_type", type)
                .put("display_name", switch (type) {
                    case "CREATE_ELEMENT" -> "创建 " + (capability.equals("CAP-OBJECT-001") ? "Object" : "Process");
                    case "UPDATE_PROPERTY" -> "编辑名称"; case "UPDATE_LAYOUT" -> "移动元素";
                    case "CREATE_FEATURE" -> capability.equals("CAP-FEAT-ATTRIBUTE-001") ? "创建属性" : "创建操作";
                    case "CREATE_STATE" -> "创建状态"; case "UPDATE_STATE" -> "编辑状态";
                    case "STATE_EXPLICIT" -> "显示状态"; case "STATE_SUPPRESS" -> "隐藏状态";
                    case "UNFOLD" -> "展开状态"; case "FOLD" -> "折叠状态";
                    default -> throw failure("DRAFT_EDIT_REJECTED", "COMMAND_NOT_IMPLEMENTED"); });
        option.putObject("capability_ref").put("capability_id", capability); option.putArray("group_path").add("元素");
        var endpoints = option.putArray("normalized_endpoints");
        if (target != null) {
            String role = switch (type) { case "UPDATE_PROPERTY" -> "PROPERTY_TARGET"; case "UPDATE_LAYOUT" -> "LAYOUT_TARGET";
                case "CREATE_FEATURE" -> "FEATURE_OWNER"; case "CREATE_STATE" -> "STATE_OWNER"; default -> "STATE_TARGET"; };
            var endpoint = endpoints.addObject().put("role", role).put("ordinal", 0);
            var ref = endpoint.putObject("target_ref").put("target_kind", targetKind).put("target_id", target);
            if (occurrence != null) ref.put("occurrence_id", occurrence);
        }
        var fields = option.putArray("required_fields");
        if (type.equals("CREATE_ELEMENT")) { field(fields, "kind", "ENUM", capability.equals("CAP-OBJECT-001") ? "OBJECT" : "PROCESS"); field(fields, "name", "TEXT"); field(fields, "layout", "LAYOUT"); }
        else if (type.equals("UPDATE_PROPERTY")) { field(fields, "target_ref", "ENDPOINT"); field(fields, "property_name", "ENUM", "name"); field(fields, "value", "TEXT"); }
        else if (type.equals("UPDATE_LAYOUT")) { field(fields, "occurrence_id", "TEXT"); field(fields, "layout", "LAYOUT"); }
        else if (type.equals("CREATE_FEATURE")) {
            field(fields, "owner_element_id", "TEXT"); field(fields, "feature_kind", "ENUM", capability.equals("CAP-FEAT-ATTRIBUTE-001") ? "ATTRIBUTE" : "OPERATION");
            field(fields, "name", "TEXT"); field(fields, "layout", "LAYOUT");
        } else if (type.equals("CREATE_STATE")) { field(fields, "owner_ref", "ENDPOINT"); field(fields, "name_or_value", "TEXT"); field(fields, "state_roles", "LIST", "INITIAL", "DEFAULT", "FINAL"); field(fields, "layout", "LAYOUT"); }
        else if (type.equals("UPDATE_STATE")) { field(fields, "state_id", "TEXT"); field(fields, "expected_owner_ref", "ENDPOINT"); field(fields, "changes", "LIST", "name_or_value", "state_roles"); }
        else field(fields, "state_id", "TEXT");
        option.putArray("allowed_modifiers"); option.set("symbol_descriptor", asset(symbol, assets.binding().symbolCatalog()));
        option.set("template_family", asset(assets.binding().textGrammar().id(), assets.binding().textGrammar())); option.putArray("rule_refs").add(asset(assets.binding().ruleSet().id(), assets.binding().ruleSet()));
        option.put("enabled", true).putArray("reason_codes"); option.set("expires_with_token", token);
        option.put("option_id", DraftCapabilityIdentity.option(query, option)); return option;
    }

    private static boolean visible(SemanticRevision revision, String context, String kind, String target) {
        return revision.occurrences().stream().anyMatch(item -> item.contextId().equals(context) && item.targetKind().name().equals(kind) && item.targetId().equals(target));
    }

    private static void validateOwnedPayload(SemanticRevision base, JsonNode scope, JsonNode chosen, String type, JsonNode payload) {
        String context = scope.get("context_id").asText(); JsonNode endpoint = chosen.at("/normalized_endpoints/0/target_ref");
        String target = endpoint.get("target_id").asText();
        if (payload.has("context_id")) require(context.equals(payload.get("context_id").asText()), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
        if (type.equals("CREATE_FEATURE") || type.equals("CREATE_STATE")) {
            JsonNode capability = payload.get("capability_ref"); String selectedCapability = chosen.at("/capability_ref/capability_id").asText();
            require(selectedCapability.equals(capability.path("capability_id").asText())
                    && (!capability.has("version") || base.profileBinding().profile().version().equals(capability.get("version").asText())), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            String role;
            if (type.equals("CREATE_FEATURE")) {
                require(target.equals(payload.path("owner_element_id").asText())
                        && selectedCapability.equals("CAP-FEAT-" + payload.path("feature_kind").asText() + "-001"), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
                role = payload.get("feature_kind").asText() + "_NODE";
            } else {
                ownerLocator(base, context, payload.get("owner_ref"), endpoint.get("target_kind").asText(), target);
                role = endpoint.get("target_kind").asText().equals("FEATURE") ? "FEATURE_STATE_NODE" : "STATE_NODE";
            }
            require(payload.at("/occurrence/ownership").asText().equals("OWNED") && payload.at("/occurrence/construct_role").asText().equals(role), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            String name = payload.get(type.equals("CREATE_FEATURE") ? "name" : "name_or_value").asText();
            require(!name.isBlank(), "INPUT_INVALID", null);
        } else {
            require(target.equals(payload.get("state_id").asText()), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            if (type.equals("UPDATE_STATE")) {
                var state = base.states().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow();
                ownerLocator(base, context, payload.get("expected_owner_ref"), state.ownerTargetKind().name(), state.ownerElementId());
                if (payload.get("changes").has("name_or_value")) require(!payload.at("/changes/name_or_value").asText().isBlank(), "INPUT_INVALID", null);
            }
        }
    }

    private static void ownerLocator(SemanticRevision base, String context, JsonNode locator, String kind, String target) {
        require(locator.path("target_kind").asText().equals(kind) && locator.path("target_id").asText().equals(target), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        if (locator.has("occurrence_id")) require(base.occurrences().stream().anyMatch(item -> item.id().equals(locator.get("occurrence_id").asText())
                && item.contextId().equals(context) && item.targetKind().name().equals(kind) && item.targetId().equals(target)), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
    }

    private OplGenerationResult generate(SemanticRevision revision, String context) {
        var assets = profiles.assemble(revision.profileBinding()); var result = text.generate(revision, context, assets);
        text.validateActiveWriteEvidence(revision, assets, result); return result;
    }
    private DraftJournalRepository repository(String project) {
        var path = databases.databasePath(project); require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS), "NOT_FOUND", null);
        return new DraftJournalRepository(path, clock);
    }
    private SemanticRevision semantic(ObjectNode document) {
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
    private static ObjectNode asset(String id, SemanticRevision.AssetReference asset) { return JSON.createObjectNode().put("id", id).put("version", asset.version()).put("digest", asset.sha256()); }
    private static void field(ArrayNode fields, String name, String kind, String... values) {
        var field = fields.addObject().put("field_id", name).put("field_kind", kind).put("required", true); var allowed = field.putArray("allowed_values"); for (String value : values) allowed.add(value);
    }
    private static JsonNode checked(JsonNode value, DraftWorkspaceContract.Type type) { return DraftWorkspaceContract.read(value.toString(), type).value(); }
    private static boolean sameToken(JsonNode token, DraftJournalRepository.Snapshot snapshot) {
        return token.get("draft_id").asText().equals(snapshot.token().draft_id()) && token.get("edit_seq").longValue() == snapshot.token().edit_seq()
                && token.get("binding_digest").asText().equals(snapshot.token().binding_digest());
    }
    private static Failure failure(String code, String reason) { return new Failure(code, reason); }
    private static void require(boolean condition, String code, String reason) { if (!condition) throw failure(code, reason); }
}
