package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.semantic.DraftTextMetadataWriter;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.text.OplTextGenerationService;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import static org.opm.localruntime.application.SemanticEditValues.*;

@Service
public final class OpdTransferService {
    public static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();
    private final LocalApiService domain;
    private final ProjectDatabaseFactory databases;
    private final ProfilePackageAssembler profiles;
    private final OplTextGenerationService text = new OplTextGenerationService();
    public OpdTransferService(LocalApiService domain, ProjectDatabaseFactory databases, FileProfilePackageLoader loader) {
        this.domain = domain; this.databases = databases; this.profiles = new ProfilePackageAssembler(loader);
    }
    public ObjectNode exportJson(String project, String model, Map<String, Object> request) {
        stableId(project); stableId(model); stableId(required(request, "request_id"));
        if (!Set.of("request_id", "context_id", "draft_token", "revision_id").containsAll(request.keySet())
                || request.containsKey("draft_token") == request.containsKey("revision_id")) OpdJsonPackage.invalid("请选择草稿或固定版本");
        String context = required(request, "context_id"); stableId(context); domain.requireActiveModel(project, model);
        ObjectNode document;
        if (request.containsKey("draft_token")) {
            var snapshot = new DraftJournalRepository(databases.databasePath(project), Clock.systemUTC()).read(project, model);
            // JSON 整数不区分 Java 的 int/long，但仍拒绝小数及额外字段。
            if (!JSON.valueToTree(snapshot.token()).equals((left, right) -> left.isIntegralNumber() && right.isIntegralNumber()
                    ? left.bigIntegerValue().compareTo(right.bigIntegerValue()) : left.equals(right) ? 0 : 1, JSON.valueToTree(request.get("draft_token"))))
                throw new ApiException(ApiErrorCode.REVISION_CONFLICT, 409, false, "草稿已变化，请刷新后重新导出");
            document = SaveContentDigestV1.read(snapshot.documentJson());
        } else { String revision = required(request, "revision_id"); stableId(revision); document = domain.transferDocument(project, model, revision); }
        var sliced = OpdJsonPackage.slice(document, context);
        var semantic = OpdJsonPackage.validate(sliced);
        var generated = text.generate(semantic, context, profiles.assemble(semantic.profileBinding())); DraftTextMetadataWriter.write(sliced, generated);
        var result = JSON.createObjectNode().put("format", "OPM-OPD-JSON").put("format_version", "1.0").put("entry_context_id", context).put("exported_at", Instant.now().toString());
        result.putObject("source").put("project_id", project).put("model_id", model).put("context_id", context);
        result.set("semantic_revision", sliced);
        if (result.toString().getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) OpdJsonPackage.invalid("OPD JSON 超过 10 MiB，请缩小导出范围");
        return result;
    }
    public Map<String, Object> importJson(String project, Map<String, Object> request) {
        stableId(project); stableId(required(request, "request_id")); stableId(required(request, "command_id"));
        if (!Set.of("request_id", "command_id", "name", "binding", "opd_package").equals(request.keySet())) OpdJsonPackage.invalid("OPD 导入请求字段无效");
        String name = required(request, "name").trim();
        if (name.isEmpty() || name.codePointCount(0, name.length()) > 256) OpdJsonPackage.invalid("模型名称应为 1–256 字");
        JsonNode packageNode = JSON.valueToTree(request.get("opd_package"));
        if (packageNode.toString().getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) OpdJsonPackage.invalid("OPD JSON 超过 10 MiB");
        if (!packageNode.isObject() || packageNode.size() != 6 || !packageNode.path("format").asText().equals("OPM-OPD-JSON")
                || !packageNode.path("format_version").asText().equals("1.0") || !packageNode.path("source").isObject()
                || !packageNode.path("exported_at").isTextual() || !packageNode.path("semantic_revision").isObject()) OpdJsonPackage.invalid("不支持此 OPD JSON 格式或版本");
        var fields = new java.util.HashSet<String>(); packageNode.fieldNames().forEachRemaining(fields::add);
        if (!fields.equals(Set.of("format", "format_version", "entry_context_id", "exported_at", "source", "semantic_revision"))) OpdJsonPackage.invalid("OPD JSON 包含未知字段");
        var source = packageNode.path("source");
        if (source.size() != 3) OpdJsonPackage.invalid("文件来源字段无效");
        for (String field : Set.of("project_id", "model_id", "context_id")) {
            if (!source.path(field).isTextual()) OpdJsonPackage.invalid("文件来源字段无效");
            stableId(source.path(field).asText());
        }
        if (!packageNode.path("entry_context_id").isTextual()) OpdJsonPackage.invalid("入口 OPD 身份无效");
        try { Instant.parse(packageNode.path("exported_at").asText()); } catch (RuntimeException exception) { OpdJsonPackage.invalid("导出时间格式无效"); }
        String context = packageNode.path("entry_context_id").asText(); stableId(context);
        ObjectNode document = ((ObjectNode) packageNode.required("semantic_revision")).deepCopy();
        var revision = OpdJsonPackage.validate(document);
        if (!packageNode.at("/source/model_id").asText().equals(revision.modelId()) || !packageNode.at("/source/context_id").asText().equals(context)) OpdJsonPackage.invalid("文件来源与入口身份不一致");
        stableId(packageNode.at("/source/project_id").asText());
        if (revision.contexts().stream().noneMatch(item -> item.id().equals(context))) OpdJsonPackage.invalid("入口 OPD 不存在");
        if (!revision.profileBinding().equals(RuntimeActiveBindingProvider.current()))
            throw new ApiException(ApiErrorCode.RULE_VERSION_CONFLICT, 409, false, "目标环境 Profile 或规则绑定与文件不一致");
        var assets = profiles.assemble(revision.profileBinding());
        for (var item : revision.contexts()) {
            var generated = text.generate(revision, item.id(), assets); text.validateActiveWriteEvidence(revision, assets, generated);
        }
        var normalized = new LinkedHashMap<>(request); normalized.put("name", name);
        var result = domain.createTransferredModel(project, normalized, document);
        @SuppressWarnings("unchecked") var model = new LinkedHashMap<>((Map<String, Object>) result.get("data"));
        model.put("context_id", context);
        return Map.of("meta", result.get("meta"), "data", model);
    }
}
