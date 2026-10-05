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
    public Connection projectConnection(String projectId) {
        Path path = databaseFactory.databasePath(projectId);
        if (!Files.isRegularFile(path)) throw notFound("项目不存在");
        return connection(path);
    }

    public Connection connection(Path path) {
        try {
            Connection connection = DriverManager.getConnection("jdbc:sqlite:" + path.toAbsolutePath() + "?foreign_keys=on");
            try (var statement = connection.createStatement()) { statement.execute("PRAGMA foreign_keys = ON"); }
            return connection;
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public List<Path> projectDatabases() {
        Path projects = databaseFactory.storageRoot().resolve("projects");
        if (!Files.isDirectory(projects)) return List.of();
        try (var paths = Files.list(projects)) { return paths.map(path -> path.resolve("project.db")).filter(Files::isRegularFile).toList(); }
        catch (Exception exception) { throw persistence(exception); }
    }

    public Map<String, Object> findProjectCreateReplay(String commandId, String digest) {
        for (Path database : projectDatabases()) {
            try (Connection connection = connection(database)) {
                Map<String, Object> replay = replay(connection, "API-PRJ-003", "projects", commandId, digest);
                if (replay != null) return replay;
            } catch (SQLException exception) { throw persistence(exception); }
        }
        return null;
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
