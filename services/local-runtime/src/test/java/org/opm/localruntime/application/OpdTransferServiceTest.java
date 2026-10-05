package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.storage.*;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class OpdTransferServiceTest {
    @TempDir Path temporary;
    final ObjectMapper json = new ObjectMapper();
    LocalApiService domain; OpdTransferService service; ProjectDatabaseFactory factory; String target, sourceProject, sourceModel;
    void setup() throws Exception {
        setup(false);
    }
    void setup(boolean suppressedState) throws Exception {
        factory = ProjectDatabaseFactory.journaledDrafts(temporary);
        var loader = new FileProfilePackageLoader(root().resolve("packages/profiles"));
        domain = new LocalApiService(factory, loader); service = new OpdTransferService(domain, factory, loader);
        String fixture = suppressedState ? "g-opl-proc-006-consumption-state-pass.json" : "g-opl-proc-001-consumption-object-pass.json";
        var document = SaveContentDigestV1.read(java.nio.file.Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/" + fixture)));
        ((ObjectNode) document.at("/elements/0")).put("essence", "PHYSICAL").put("affiliation", "ENVIRONMENTAL");
        ((ObjectNode) document.at("/layouts/0")).putArray("route_points").addObject().put("x", -0d).put("y", 23.5);
        {
            document.put("schema_version", "0.3");
            addOwnedContext(document, "context.child", "PROCESS_REFINEMENT");
            addOwnedContext(document, "context.unrelated", "MODEL_VIEW");
            String process = ""; for (var item : document.path("elements")) if (item.path("core_kind").asText().equals("PROCESS")) process = item.path("element_id").asText();
            document.putArray("refinement_edges").addObject().put("refinement_id", "refinement.child").put("parent_context_id", CONTEXT).put("child_context_id", "context.child").put("refinee_element_id", process).put("refinement_kind", "PROCESS");
            if (suppressedState) document.withArray("state_presentations").addObject().put("context_id", "context.child")
                    .put("state_id", document.at("/states/0/state_id").asText()).put("explicitness", "SUPPRESSED").put("fold_state", "UNFOLDED");
        }
        sourceProject = ((Map<?, ?>) domain.createProject(Map.of("request_id", "request.source", "command_id", "command.source", "name", "迁移来源")).get("data")).get("project_id").toString();
        sourceModel = ((Map<?, ?>) domain.createTransferredModel(sourceProject, Map.of("request_id", "request.source-model", "command_id", "command.source-model", "name", "来源模型", "binding", domain.activeProfileRuleBinding()), document).get("data")).get("model_id").toString();
        target = ((Map<?, ?>) domain.createProject(Map.of("request_id", "request.target", "command_id", "command.target", "name", "迁移目标")).get("data")).get("project_id").toString();
    }
    ObjectNode export() {
        var snapshot = new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel);
        return service.exportJson(sourceProject, sourceModel, Map.of("request_id", "request.export", "context_id", "context.child", "draft_token", snapshot.token()));
    }
    Map<String, Object> input(ObjectNode file) {
        return new LinkedHashMap<>(Map.of("request_id", "request.import", "command_id", "command.import", "name", "迁移模型", "binding", domain.activeProfileRuleBinding(), "opd_package", file));
    }
    @Test void 子图及父级依赖跨项目迁移并保留完整持久字段() throws Exception {
        setup(); var before = new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel);
        var file = export();
        assertEquals(2, file.at("/semantic_revision/contexts").size());
        assertFalse(file.at("/semantic_revision/contexts").toString().contains("context.unrelated"));
        assertEquals("PHYSICAL", file.at("/semantic_revision/elements/0/essence").asText());
        var result = service.importJson(target, input(file)); var data = (Map<?, ?>) result.get("data");
        String model = data.get("model_id").toString(); assertNotEquals(sourceModel, model); assertEquals("context.child", data.get("context_id"));
        var imported = new DraftJournalRepository(factory.databasePath(target), Clock.systemUTC()).read(target, model);
        var document = SaveContentDigestV1.read(imported.documentJson());
        for (String field : java.util.List.of("elements", "features", "states", "facts", "contexts", "occurrences", "layouts", "state_presentations", "refinement_edges"))
            assertEquals(file.at("/semantic_revision/" + field), document.path(field), field);
        assertEquals(0, imported.token().edit_seq()); assertEquals("0.3", document.path("schema_version").asText());
        assertEquals(before, new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel));
        assertTrue(domain.workspace("request.reopen", target, model, null, "context.child").toString().contains("context.child"));
    }
    @Test void 架构分类随子图跨项目迁移且原模型不变() throws Exception {
        setup(); var before = new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel);
        var file = export(); var document = (ObjectNode) file.get("semantic_revision"); document.put("schema_version", "0.4");
        ((ObjectNode) document.at("/contexts/0")).put("architecture_level", "MISSION");
        ((ObjectNode) document.at("/contexts/1")).put("architecture_level", "FUNCTION");
        var result = service.importJson(target, input(file)); String model = ((Map<?, ?>) result.get("data")).get("model_id").toString();
        var imported = SaveContentDigestV1.read(new DraftJournalRepository(factory.databasePath(target), Clock.systemUTC()).read(target, model).documentJson());
        assertEquals("0.4", imported.path("schema_version").asText()); assertEquals(document.get("contexts"), imported.get("contexts"));
        assertEquals(document.get("refinement_edges"), imported.get("refinement_edges"));
        assertEquals(before, new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel));
        ((ObjectNode) document.at("/contexts/0")).put("architecture_level", "INVALID");
        var invalid = input(file); invalid.put("command_id", "command.invalid.classification");
        assertThrows(ApiException.class, () -> service.importJson(target, invalid)); assertEquals(1, count("model_catalog"));
    }
    @Test void 架构关联回环闭包跨项目迁移且拒绝缺失目标自连和重复身份() throws Exception {
        setup(); var original = new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel);
        var source = SaveContentDigestV1.read(original.documentJson()); source.put("schema_version", "0.5");
        ((ObjectNode) source.at("/contexts/1")).putArray("architecture_links").addObject().put("link_id", "link.input").put("target_context_id", "context.unrelated").put("kind", "INPUT");
        ((ObjectNode) source.at("/contexts/2")).putArray("architecture_links").addObject().put("link_id", "link.trace").put("target_context_id", "context.child").put("kind", "TRACE");
        var sliced = OpdJsonPackage.slice(source, "context.child"); assertEquals(3, sliced.path("contexts").size());
        var file = export(); file.set("semantic_revision", sliced);
        String model = ((Map<?, ?>) service.importJson(target, input(file)).get("data")).get("model_id").toString();
        var imported = SaveContentDigestV1.read(new DraftJournalRepository(factory.databasePath(target), Clock.systemUTC()).read(target, model).documentJson());
        assertEquals(sliced.get("contexts"), imported.get("contexts")); assertEquals("0.5", imported.path("schema_version").asText());
        assertEquals(original, new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel));
        for (String fault : java.util.List.of("target", "self", "duplicate", "identity", "kind")) {
            var invalid = file.deepCopy(); var link = (ObjectNode) invalid.at("/semantic_revision/contexts/1/architecture_links/0");
            switch (fault) {
                case "target" -> link.put("target_context_id", "context.absent");
                case "self" -> link.put("target_context_id", "context.child");
                case "duplicate" -> ((com.fasterxml.jackson.databind.node.ArrayNode) invalid.at("/semantic_revision/contexts/1/architecture_links")).add(link.deepCopy().put("link_id", "link.duplicate"));
                case "identity" -> link.put("link_id", "context.child");
                case "kind" -> link.put("kind", "AUTO");
            }
            var request = input(invalid); request.put("command_id", "command.invalid." + fault);
            assertThrows(ApiException.class, () -> service.importJson(target, request), fault); assertEquals(1, count("model_catalog"));
        }
    }
    @Test void 重试忽略请求ID且只创建一次不同内容重用命令拒绝() throws Exception {
        setup(); var request = input(export()); var first = service.importJson(target, request);
        request.put("request_id", "request.retry"); var retry = service.importJson(target, request);
        assertEquals(first.get("data"), retry.get("data")); assertEquals(1, count("model_catalog"));
        request.put("name", "不同名称"); assertThrows(ApiException.class, () -> service.importJson(target, request)); assertEquals(1, count("model_catalog"));
    }
    @Test void 跨图共享状态及状态资格与抑制设置完整迁移() throws Exception {
        setup(true); var file = export(); var result = service.importJson(target, input(file));
        var imported = SaveContentDigestV1.read(new DraftJournalRepository(factory.databasePath(target), Clock.systemUTC())
                .read(target, ((Map<?, ?>) result.get("data")).get("model_id").toString()).documentJson());
        for (String field : java.util.List.of("elements", "states", "facts", "occurrences", "state_presentations"))
            assertEquals(file.at("/semantic_revision/" + field), imported.path(field), field);
        assertEquals("SUPPRESSED", imported.at("/state_presentations/0/explicitness").asText());
        assertEquals(1, imported.path("states").size());
    }
    @Test void 过大迁移包拒绝且零模型写入() throws Exception {
        setup(); var file = export(); ((ObjectNode) file.at("/semantic_revision/model_header")).put("description", "x".repeat(OpdTransferService.MAX_BYTES));
        assertEquals(400, assertThrows(ApiException.class, () -> service.importJson(target, input(file))).status());
        assertEquals(0, count("model_catalog"));
    }
    @Test void 格式损坏断裂引用和规则冲突均零模型写入() throws Exception {
        setup();
        for (String kind : java.util.List.of("version", "reference", "binding", "entry", "unknown", "source", "identity", "legacy")) {
            var file = export();
            switch (kind) {
                case "version" -> file.put("format_version", "2.0");
                case "reference" -> ((ObjectNode) file.at("/semantic_revision/occurrences/0")).put("target_id", "element.absent");
                case "binding" -> ((ObjectNode) file.at("/semantic_revision/profile_binding/binding_digest")).put("digest", "0".repeat(64));
                case "entry" -> file.put("entry_context_id", "context.absent");
                case "source" -> ((ObjectNode) file.path("source")).put("extra", true);
                case "identity" -> ((ObjectNode) file.at("/semantic_revision/model_header/identity_namespace")).put("namespace", 42);
                case "legacy" -> ((ObjectNode) file.path("semantic_revision")).put("schema_version", "0.1");
                default -> file.put("extra", true);
            }
            assertThrows(ApiException.class, () -> service.importJson(target, input(file)), kind); assertEquals(0, count("model_catalog"));
        }
    }
    @Test void 新模型草稿初始化失败时整体回滚且重试成功() throws Exception {
        setup(); var request = input(export());
        sql("CREATE TRIGGER fail_import BEFORE INSERT ON model_save_mode BEGIN SELECT RAISE(ABORT,'failure'); END");
        assertThrows(ApiException.class, () -> service.importJson(target, request));
        for (String table : java.util.List.of("model_catalog", "model_head", "revision_document", "draft_stream", "draft_content", "draft_checkpoint")) assertEquals(0, count(table), table);
        sql("DROP TRIGGER fail_import"); service.importJson(target, request); assertEquals(1, count("model_catalog"));
    }
    @Test void 过期草稿token拒绝导出且固定版本可导出() throws Exception {
        setup(); var snapshot = new DraftJournalRepository(factory.databasePath(sourceProject), Clock.systemUTC()).read(sourceProject, sourceModel);
        ObjectNode token = json.valueToTree(snapshot.token()); token.put("edit_seq", 99);
        assertThrows(ApiException.class, () -> service.exportJson(sourceProject, sourceModel, Map.of("request_id", "request.stale", "context_id", CONTEXT, "draft_token", token)));
        var revision = SaveContentDigestV1.read(snapshot.documentJson()).path("revision_id").asText();
        assertEquals("OPM-OPD-JSON", service.exportJson(sourceProject, sourceModel, Map.of("request_id", "request.exact", "context_id", CONTEXT, "revision_id", revision)).path("format").asText());
    }
    int count(String table) throws Exception { try (var c = DriverManager.getConnection("jdbc:sqlite:" + factory.databasePath(target)); var s = c.createStatement(); var rows = s.executeQuery("SELECT COUNT(*) FROM " + table)) { rows.next(); return rows.getInt(1); } }
    void sql(String sql) throws Exception { try (var c = DriverManager.getConnection("jdbc:sqlite:" + factory.databasePath(target)); var s = c.createStatement()) { s.execute(sql); } }
}
