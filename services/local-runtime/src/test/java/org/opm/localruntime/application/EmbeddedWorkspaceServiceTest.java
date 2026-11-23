package org.opm.localruntime.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.storage.ProjectDatabaseFactory;

import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.*;

class EmbeddedWorkspaceServiceTest {
    @TempDir Path storage;
    @Test void 初始迁移文档持久化且相同来源重试不覆盖现有模型() throws Exception {
        var factory=ProjectDatabaseFactory.journaledDrafts(storage);
        var service=new LocalApiService(factory);
        var initial=service.embeddedModelTemplate();
        ((com.fasterxml.jackson.databind.node.ObjectNode)initial.path("model_header")).put("description","legacy migration retained");
        var input=new java.util.LinkedHashMap<>(request("migration-test","project","model","迁移模型"));
        input.put("initial_document",initial);
        var binding=service.ensureEmbeddedWorkspace(input);
        String project=binding.get("projectId").toString(),model=binding.get("modelId").toString();
        var repository=new org.opm.localruntime.storage.DraftJournalRepository(factory.snapshot(project),java.time.Clock.systemUTC());
        var before=repository.read(project,model);
        assertEquals("legacy migration retained",org.opm.localruntime.semantic.SaveContentDigestV1.read(before.documentJson()).at("/model_header/description").asText());
        input.put("initial_document",java.util.Map.of("invalid","must not overwrite"));
        assertEquals(binding,service.ensureEmbeddedWorkspace(input));
        assertEquals(before,repository.read(project,model));
        input.put("source",java.util.Map.of("systemId","migration-test","projectId","project","projectName","项目","modelId","invalid","modelName","无效模型"));
        assertThrows(ApiException.class,()->service.ensureEmbeddedWorkspace(input));
    }
    private Map<String, Object> request(String system, String project, String model, String name) {
        return Map.of("request_id", "request.test", "source", Map.of("systemId", system, "projectId", project,
                "projectName", "宿主项目", "modelId", model, "modelName", name));
    }

    @Test void uuid身份重试名称改变和重启复用且不同模型与系统隔离() {
        var factory = ProjectDatabaseFactory.journaledDrafts(storage);
        var service = new LocalApiService(factory);
        var input = request("host-a", "21e3-host-project", "123-host-model", "模型一");
        var first = service.ensureEmbeddedWorkspace(input);
        assertTrue(first.get("projectId").toString().startsWith("project."));
        assertEquals(first, service.ensureEmbeddedWorkspace(request("host-a", "21e3-host-project", "123-host-model", "显示名称变了")));
        assertEquals(first, new LocalApiService(factory).ensureEmbeddedWorkspace(input));
        assertEquals(first, service.ensureEmbeddedWorkspace(Map.of("request_id", "request.binding", "binding", first)));
        var second = service.ensureEmbeddedWorkspace(request("host-a", "21e3-host-project", "second-model", "模型一"));
        assertEquals(first.get("projectId"), second.get("projectId"));
        assertNotEquals(first.get("modelId"), second.get("modelId"));
        var other = service.ensureEmbeddedWorkspace(request("host-b", "21e3-host-project", "123-host-model", "模型一"));
        assertNotEquals(first.get("projectId"), other.get("projectId"));
        assertEquals(2, ((List<?>) service.listProjects("request.list", null).get("data")).size());
    }

    @Test void 并发首次请求只有一个关联且归档或错误绑定不重新创建() throws Exception {
        var factory = ProjectDatabaseFactory.journaledDrafts(storage);
        var service = new LocalApiService(factory);
        var input = request("default", "business-project", "business-model", "模型");
        var executor = Executors.newFixedThreadPool(6);
        try {
            List<Callable<Map<String, Object>>> calls = java.util.stream.IntStream.range(0, 6)
                    .mapToObj(index -> (Callable<Map<String, Object>>) () -> service.ensureEmbeddedWorkspace(input)).toList();
            var results = executor.invokeAll(calls);
            var first = results.get(0).get();
            for (var result : results) assertEquals(first, result.get());
            String project = first.get("projectId").toString();
            try (var connection = org.opm.localruntime.storage.SqliteTestSupport.connection(factory.snapshot(project));
                 var update = connection.prepareStatement("UPDATE model_catalog SET status = 'ARCHIVED' WHERE model_id = ?")) {
                update.setString(1, first.get("modelId").toString()); update.executeUpdate();
            }
            assertEquals(404, assertThrows(ApiException.class, () -> service.ensureEmbeddedWorkspace(input)).status());
            new org.opm.localruntime.storage.ModelLifecycleRepository(factory.snapshot(project))
                    .change(project, first.get("modelId").toString(), "command.purge.test", "digest.purge.test", "PURGE", "ARCHIVED", "模型");
            assertEquals(404, assertThrows(ApiException.class, () -> service.ensureEmbeddedWorkspace(input)).status());
            assertEquals(404, assertThrows(ApiException.class, () -> service.ensureEmbeddedWorkspace(Map.of(
                    "request_id", "request.missing", "binding", Map.of("projectId", project, "modelId", "model.missing")))).status());
            assertEquals(1, ((List<?>) service.listProjects("request.list", null).get("data")).size());
        } finally {
            executor.shutdownNow();
        }
    }
}
