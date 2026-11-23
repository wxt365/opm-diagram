package org.opm.localruntime.storage;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.ApiErrorCode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 共享 JDBC 连接与提交记录；调用方决定事务开始、提交与回滚。 */
public final class LocalApiRepository {
    private final ProjectDatabaseFactory databaseFactory;
    private final ObjectMapper objectMapper = new ObjectMapper();
    public LocalApiRepository(ProjectDatabaseFactory databaseFactory) { this.databaseFactory = databaseFactory; }
    /** 跨项目创建串行化，保证同一创建命令在多个服务实例间仍可重放。 */
    public <T> T catalogWrite(java.util.function.Supplier<T> action) {
        try (var connection = databaseFactory.store().catalogConnection()) {
            connection.setAutoCommit(false);
            ProjectConnectionFactory.lockProject(connection);
            T result = action.get();
            connection.commit();
            return result;
        } catch (SQLException error) { throw persistence(error); }
    }
    public Connection projectConnection(String projectId) {
        ProjectScope scope = databaseFactory.databaseScope(projectId);
        if (!scope.exists()) throw notFound("项目不存在");
        return connection(scope);
    }

    public Connection connection(ProjectScope scope) {
        try {
            return scope.getConnection();
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public List<ProjectScope> projectDatabases() {
        return databaseFactory.store().projects();
    }

    public Map<String, Object> findProjectCreateReplay(String commandId, String digest) {
        for (ProjectScope database : projectDatabases()) {
            try (Connection connection = connection(database)) {
                Map<String, Object> replay = replay(connection, "API-PRJ-003", "projects", commandId, digest);
                if (replay != null) return replay;
            } catch (SQLException exception) { throw persistence(exception); }
        }
        return null;
    }

    /** 嵌入关联使用确定性命令身份；名称变化不改变首次创建的资源。 */
    public Map<String, Object> findEmbeddedProject(String commandId) {
        for (ProjectScope database : projectDatabases()) {
            try (Connection connection = connection(database)) {
                Map<String, Object> result = createdResource(connection, "API-PRJ-003", "projects", commandId);
                if (result != null) return result;
            } catch (SQLException exception) { throw persistence(exception); }
        }
        return null;
    }

    public Map<String, Object> findEmbeddedModel(String project, String commandId) {
        try (Connection connection = projectConnection(project)) {
            Map<String, Object> mapping = createdResource(connection, "API-EMBED-MODEL", project, commandId);
            return mapping != null ? mapping : createdResource(connection, "API-PRJ-007", project, commandId);
        } catch (SQLException exception) { throw persistence(exception); }
    }

    /** 保留关联墓碑，模型彻底删除后 source 再次进入也不会默默重建。 */
    public void rememberEmbeddedModel(String project, String commandId, Map<String, Object> model) {
        try (Connection connection = projectConnection(project)) {
            if (createdResource(connection, "API-EMBED-MODEL", project, commandId) == null)
                writeIdempotency(connection, "API-EMBED-MODEL", project, commandId, commandId, null,
                        Map.of("model_id", model.get("model_id")), java.time.Instant.now().toString());
        } catch (Exception exception) { throw persistence(exception); }
    }

    public boolean modelNameExists(String project, String normalizedName) {
        try (Connection connection = projectConnection(project);
             PreparedStatement statement = connection.prepareStatement("SELECT 1 FROM model_catalog WHERE project_id = ? AND normalized_name = ?")) {
            statement.setString(1, project); statement.setString(2, normalizedName);
            try (ResultSet result = statement.executeQuery()) { return result.next(); }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    private Map<String, Object> createdResource(Connection connection, String operation, String aggregate, String command) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT result_json FROM idempotency_record WHERE operation_id = ? AND aggregate_id = ? AND command_id = ?")) {
            statement.setString(1, operation); statement.setString(2, aggregate); statement.setString(3, command);
            try (ResultSet result = statement.executeQuery()) { return result.next() ? map(result.getString(1)) : null; }
        }
    }

    public Map<String, Object> replay(Connection connection, String operation, String aggregate, String commandId, String digest, String... compatibleDigests) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT request_digest, result_json FROM idempotency_record WHERE operation_id = ? AND aggregate_id = ? AND command_id = ?")) {
            statement.setString(1, operation); statement.setString(2, aggregate); statement.setString(3, commandId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return null;
                String stored = result.getString(1);
                if (!digest.equals(stored) && java.util.Arrays.stream(compatibleDigests).noneMatch(stored::equals))
                    throw new ApiException(ApiErrorCode.IDEMPOTENCY_MISMATCH, 409, false, "command_id 已绑定不同请求");
                return map(result.getString(2));
            }
        }
    }

    public void writeIdempotency(Connection connection, String operation, String aggregate, String commandId, String digest, String revision, Map<String, Object> result, String now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO idempotency_record(operation_id, aggregate_id, command_id, request_digest, result_status, result_revision_id, result_json, created_at) VALUES (?, ?, ?, ?, 'COMMITTED', ?, ?, ?)")) {
            statement.setString(1, operation); statement.setString(2, aggregate); statement.setString(3, commandId); statement.setString(4, digest); statement.setString(5, revision); statement.setString(6, objectMapper.writeValueAsString(result)); statement.setString(7, now); statement.executeUpdate();
        }
    }

    public void writeOperation(Connection connection, String projectId, String modelId, String operation, String aggregate, String commandId, String inputRevision, String resultRevision, String status, String now) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO operation_record(operation_record_id, project_id, model_id, operation_id, aggregate_id, command_id, input_revision_id, result_revision_id, result_status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            statement.setString(1, newId("operation")); statement.setString(2, projectId); statement.setString(3, modelId); statement.setString(4, operation); statement.setString(5, aggregate); statement.setString(6, commandId); statement.setString(7, inputRevision); statement.setString(8, resultRevision); statement.setString(9, status); statement.setString(10, now); statement.executeUpdate();
        }
    }

    private ApiException persistence(Exception exception) { return new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 500, true, "本地持久化失败"); }
    private ApiException notFound(String message) { return new ApiException(ApiErrorCode.NOT_FOUND, 404, false, message); }
    private String newId(String prefix) { return prefix + "." + UUID.randomUUID().toString().replace("-", ""); }
    private Map<String, Object> map(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() { }); }
        catch (Exception ignored) { return Map.of(); }
    }
}
