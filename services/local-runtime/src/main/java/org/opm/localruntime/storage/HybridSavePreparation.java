package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationReport;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationRequest;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftToken;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteConnection;
import org.sqlite.SQLiteDataSource;

import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.sql.Connection;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/** 为后继草稿 Runtime 准备独立副本；本类不装配到生产请求入口。 */
public final class HybridSavePreparation {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<String, String> MIGRATIONS = Map.of(
            "V1__initial_schema.sql", "0ea9217a8d09e2bdd8ada4e9622d69e0df9ccdf5fe8c3d3574908652c7cafdd5",
            "V2__exchange_import_origin.sql", "2e84d7906cf4477f81541d60bed7a25fd600d86c1d6110742e6a4a80700cb786",
            "hybrid-save/V3__hybrid_save_foundation.sql", "4e6547b14f4b502a2c91be8675e90281a0a092b48f1ef13c5230841e34fe0776");
    private final Consumer<String> stage;

    public HybridSavePreparation() { this(ignored -> { }); }
    // 包内回调只用于测试事务回滚，无 Spring 配置或外部故障入口。
    HybridSavePreparation(Consumer<String> stage) { this.stage = java.util.Objects.requireNonNull(stage); }

    public DraftPreparationReport prepare(Path sourceDatabase, Path outputRoot, Path migrationRoot, DraftPreparationRequest request) {
        try {
            require(request != null && migrationRoot != null, "INPUT_INVALID");
            regular(sourceDatabase, "INPUT_INVALID");
            Path source = sourceDatabase.toRealPath();
            Path output = outputPath(outputRoot);
            if (Files.exists(output, LinkOption.NOFOLLOW_LINKS)) {
                require(Files.isDirectory(output, LinkOption.NOFOLLOW_LINKS)
                        && Files.isRegularFile(output.resolve("report.json"), LinkOption.NOFOLLOW_LINKS), "OUTPUT_EXISTS");
                DraftPreparationReport previous = verify(output);
                require(previous.request().equals(request), "OUTPUT_EXISTS");
                return previous;
            }
            Path migrations = migrationRoot.toRealPath();
            for (var entry : MIGRATIONS.entrySet()) {
                Path file = migrations.resolve(entry.getKey()); regular(file, "SCHEMA_MISMATCH");
                require(hash(file).equals(entry.getValue()), "SCHEMA_MISMATCH");
            }
            // 排他创建根；失败根保留且没有完成报告，不能作为可消费副本。
            try { Files.createDirectory(output); }
            catch (java.nio.file.FileAlreadyExistsException exception) { throw failure("OUTPUT_EXISTS", exception); }
            Path backup = output.resolve("backup.sqlite"), prepared = output.resolve("prepared.sqlite");
            try (Connection connection = readOnly(source)) {
                int result = connection.unwrap(SQLiteConnection.class).getDatabase().backup("main", backup.toString(), null);
                require(result == 0, "PERSISTENCE_FAILED");
            }
            seal(backup);
            PreparedDraftRepository.Source captured;
            try (Connection connection = readOnly(backup)) {
                PreparedDraftRepository.integrity(connection);
                legacyVersion(connection);
                captured = PreparedDraftRepository.source(connection, request);
            }
            Files.copy(backup, prepared);
            var dataSource = SqliteConnectionFactory.create(prepared);
            Flyway flyway = Flyway.configure().dataSource(dataSource).locations("filesystem:" + migrations)
                    .target("3").ignoreMigrationPatterns("*:pending").mixed(true).load();
            var migrationInfo = flyway.info().all();
            require(migrationInfo.length == 3 && java.util.Arrays.stream(migrationInfo)
                    .map(info -> info.getVersion() == null ? "" : info.getVersion().toString()).collect(Collectors.toSet())
                    .equals(Set.of("1", "2", "3")), "SCHEMA_MISMATCH");
            flyway.validate();
            flyway.migrate();
            try (Connection connection = dataSource.getConnection()) {
                connection.setAutoCommit(false);
                try {
                    PreparedDraftRepository.seed(connection, request, captured, stage);
                    PreparedDraftRepository.read(connection, request, captured);
                    PreparedDraftRepository.integrity(connection);
                    PreparedDraftRepository.compareLegacy(connection, backup);
                    connection.commit();
                } catch (Exception exception) { connection.rollback(); throw exception; }
            }
            seal(prepared);
            var content = verifyDatabases(backup, prepared, request);
            force(backup); force(prepared);
            var report = new DraftPreparationReport("OPM-DRAFT-PREPARATION", "0.1", "PREPARED", request,
                    new DraftToken(request.draft_id(), 0L, request.expected_binding_digest()),
                    content.contentDigest(), content.artifactDigest(), hash(backup), hash(prepared), Files.size(backup), Files.size(prepared));
            Path temporary = output.resolve("report.json.pending");
            Files.writeString(temporary, JSON.writeValueAsString(report) + "\n", StandardOpenOption.CREATE_NEW);
            force(temporary);
            Files.move(temporary, output.resolve("report.json"), StandardCopyOption.ATOMIC_MOVE);
            force(output);
            return report;
        } catch (Failure exception) { throw exception; }
        catch (Exception exception) { throw failure("PERSISTENCE_FAILED", exception); }
    }

    public DraftPreparationReport verify(Path outputRoot) {
        try {
            require(outputRoot != null && Files.isDirectory(outputRoot, LinkOption.NOFOLLOW_LINKS), "INPUT_INVALID");
            Path root = outputRoot.toRealPath(), reportPath = root.resolve("report.json");
            regular(reportPath, "CONTENT_MISMATCH");
            DraftPreparationReport report;
            try { report = DraftSaveContract.read(Files.readString(reportPath), DraftPreparationReport.class); }
            catch (Exception exception) { throw failure("CONTENT_MISMATCH", exception); }
            Path backup = root.resolve("backup.sqlite"), prepared = root.resolve("prepared.sqlite");
            standalone(backup); standalone(prepared);
            require(Files.size(backup) == report.backup_bytes() && Files.size(prepared) == report.prepared_bytes()
                    && hash(backup).equals(report.backup_sha256()) && hash(prepared).equals(report.prepared_sha256()), "CONTENT_MISMATCH");
            require(report.token().equals(new DraftToken(report.request().draft_id(), 0L, report.request().expected_binding_digest())), "CONTENT_MISMATCH");
            var content = verifyDatabases(backup, prepared, report.request());
            require(content.contentDigest().equals(report.content_digest()) && content.artifactDigest().equals(report.artifact_digest()), "CONTENT_MISMATCH");
            return report;
        } catch (Failure exception) { throw exception; }
        catch (Exception exception) { throw failure("CONTENT_MISMATCH", exception); }
    }

    private PreparedDraftRepository.Content verifyDatabases(Path backup, Path prepared, DraftPreparationRequest request) throws Exception {
        standalone(backup); standalone(prepared);
        PreparedDraftRepository.Source captured;
        try (Connection connection = readOnly(backup)) {
            legacyVersion(connection);
            PreparedDraftRepository.integrity(connection);
            captured = PreparedDraftRepository.source(connection, request);
        }
        try (Connection connection = readOnly(prepared)) {
            require("1.2".equals(version(connection)), "SCHEMA_MISMATCH");
            PreparedDraftRepository.integrity(connection);
            var source = PreparedDraftRepository.source(connection, request);
            require(source.raw().equals(captured.raw()), "CONTENT_MISMATCH");
            var content = PreparedDraftRepository.read(connection, request, captured);
            PreparedDraftRepository.compareLegacy(connection, backup);
            return content;
        }
    }

    private static Path outputPath(Path input) throws Exception {
        require(input != null, "INPUT_INVALID");
        Path absolute = input.toAbsolutePath().normalize();
        require(absolute.getParent() != null && Files.isDirectory(absolute.getParent()), "INPUT_INVALID");
        require(!Files.isSymbolicLink(absolute), "OUTPUT_EXISTS");
        return absolute.getParent().toRealPath().resolve(absolute.getFileName());
    }
    static Connection readOnly(Path database) throws Exception {
        SQLiteConfig config = new SQLiteConfig();
        config.setReadOnly(true); config.enforceForeignKeys(true); config.setBusyTimeout(5000);
        SQLiteDataSource source = new SQLiteDataSource(config);
        source.setUrl("jdbc:sqlite:" + database.toAbsolutePath());
        return source.getConnection();
    }
    private static void seal(Path file) throws Exception {
        try (Connection connection = SqliteConnectionFactory.create(file).getConnection(); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("PRAGMA wal_checkpoint(TRUNCATE)")) { require(rows.next() && rows.getInt(1) == 0, "PERSISTENCE_FAILED"); }
            try (var rows = statement.executeQuery("PRAGMA journal_mode=DELETE")) { require(rows.next() && "delete".equalsIgnoreCase(rows.getString(1)), "PERSISTENCE_FAILED"); }
        }
        standalone(file);
    }
    private static void standalone(Path file) throws Exception {
        regular(file, "CONTENT_MISMATCH");
        for (String suffix : new String[]{"-wal", "-shm", "-journal"}) require(!Files.exists(file.resolveSibling(file.getFileName() + suffix), LinkOption.NOFOLLOW_LINKS), "CONTENT_MISMATCH");
    }
    private static String version(Connection connection) throws Exception {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT metadata_value FROM schema_metadata WHERE metadata_key='storage_schema_version'")) {
            require(rows.next(), "SCHEMA_MISMATCH"); return rows.getString(1);
        }
    }
    private static void legacyVersion(Connection connection) throws Exception {
        require(Set.of("1.0", "1.1").contains(version(connection)), "SCHEMA_MISMATCH");
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('draft_stream','model_save_mode')")) {
            require(rows.next() && rows.getInt(1) == 0, "SCHEMA_MISMATCH");
        }
    }
    private static void regular(Path file, String code) { require(file != null && Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS), code); }
    private static void force(Path file) throws Exception {
        try (FileChannel channel = FileChannel.open(file, Files.isDirectory(file) ? StandardOpenOption.READ : StandardOpenOption.WRITE)) { channel.force(true); }
    }
    static String hash(String text) { return hash(text.getBytes(StandardCharsets.UTF_8)); }
    static String hash(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (var stream = Files.newInputStream(file)) {
            byte[] bytes = new byte[65536]; int count;
            while ((count = stream.read(bytes)) >= 0) if (count > 0) digest.update(bytes, 0, count);
        }
        return HexFormat.of().formatHex(digest.digest());
    }
    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception exception) { throw new IllegalStateException("SHA-256 不可用", exception); }
    }
    private static void require(boolean condition, String code) { if (!condition) throw failure(code, null); }
    static Failure failure(String code, Exception cause) { return new Failure("DRAFT_PREPARATION_" + code, cause); }
    public static final class Failure extends IllegalStateException {
        private final String code;
        private Failure(String code, Exception cause) { super(code, cause); this.code = code; }
        public String code() { return code; }
    }
}
