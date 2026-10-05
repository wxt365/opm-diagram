package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationReport;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/** 仅迁移全新隔离副本；事务激活与旧表等价校验集中在此处。 */
public final class ActivatedDraftRepository {
    private static final Map<String, String> SQL = Map.of(
            "sqlite/V1__initial_schema.sql", "0ea9217a8d09e2bdd8ada4e9622d69e0df9ccdf5fe8c3d3574908652c7cafdd5",
            "sqlite/V2__exchange_import_origin.sql", "2e84d7906cf4477f81541d60bed7a25fd600d86c1d6110742e6a4a80700cb786",
            "sqlite/hybrid-save/V3__hybrid_save_foundation.sql", "4e6547b14f4b502a2c91be8675e90281a0a092b48f1ef13c5230841e34fe0776",
            "sqlite-checkpoint/V4__checkpoint_capture_overlay.sql", "ce9e980bfdd81b5ee5bdf5f81faad5568262f8b577e922fa69bc44a888a040b4",
            "sqlite-pin/V5__pin_retention_nullable_sequence.sql", "01c6fc818a03a13feb2af819c31c8ba7664b58e372b0f09cab7a17bb498e4665");
    private final Consumer<String> stage;
    public ActivatedDraftRepository() { this(ignored -> { }); }
    // 仅包内测试使用，无生产故障配置。
    ActivatedDraftRepository(Consumer<String> stage) { this.stage = stage; }

    public String source(Path backup, DraftPreparationReport report) throws Exception {
        try (var connection = HybridSavePreparation.readOnly(backup)) {
            return PreparedDraftRepository.source(connection, report.request()).raw();
        }
    }

    public void seal(Path database) throws Exception {
        try (var connection = SqliteConnectionFactory.create(database).getConnection(); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("PRAGMA wal_checkpoint(TRUNCATE)")) {
                if (!rows.next() || rows.getInt(1) != 0) throw new IllegalStateException("检查点未完成");
            }
            try (var rows = statement.executeQuery("PRAGMA journal_mode=DELETE")) {
                if (!rows.next() || !"delete".equalsIgnoreCase(rows.getString(1))) throw new IllegalStateException("数据库未封装为独立文件");
            }
        }
    }

    public void activate(Path database, Path backup, Path migrations, DraftPreparationReport report) throws Exception {
        for (var entry : SQL.entrySet()) {
            Path file = migrations.resolve(entry.getKey());
            if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || !HybridSavePreparation.hash(file).equals(entry.getValue()))
                throw new IllegalArgumentException("SCHEMA_MISMATCH");
        }
        var datasource = SqliteConnectionFactory.create(database);
        var flyway = Flyway.configure().dataSource(datasource).locations("filesystem:" + migrations.resolve("sqlite"),
                "filesystem:" + migrations.resolve("sqlite-checkpoint"), "filesystem:" + migrations.resolve("sqlite-pin"))
                .target("5").ignoreMigrationPatterns("*:pending").mixed(true).load();
        var info = flyway.info().all();
        if (info.length != 5 || !java.util.Arrays.stream(info).map(item -> item.getVersion() == null ? "" : item.getVersion().toString())
                .collect(Collectors.toSet()).equals(Set.of("1", "2", "3", "4", "5"))) throw new IllegalArgumentException("SCHEMA_MISMATCH");
        flyway.validate(); flyway.migrate();
        try (var connection = datasource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                var captured = PreparedDraftRepository.source(connection, report.request());
                PreparedDraftRepository.read(connection, report.request(), captured);
                PreparedDraftRepository.compareLegacy(connection, backup);
                stage.accept("BEFORE_MODE");
                try (var statement = connection.prepareStatement("INSERT INTO model_save_mode VALUES (?,'JOURNALED_DRAFT_V2',?)")) {
                    statement.setString(1, report.request().model_id()); statement.setString(2, report.token().draft_id());
                    if (statement.executeUpdate() != 1) throw new IllegalStateException("激活行数不唯一");
                }
                stage.accept("AFTER_MODE");
                PreparedDraftRepository.read(connection, report.request(), captured, true);
                PreparedDraftRepository.integrity(connection);
                stage.accept("BEFORE_COMMIT"); connection.commit();
            } catch (Exception error) { connection.rollback(); throw error; }
        }
    }

    public String verify(Path database, Path backup, DraftPreparationReport report) throws Exception {
        try (var connection = HybridSavePreparation.readOnly(database)) {
            var captured = PreparedDraftRepository.source(connection, report.request());
            var content = PreparedDraftRepository.read(connection, report.request(), captured, true);
            if (!report.content_digest().equals(content.contentDigest()) || !report.artifact_digest().equals(content.artifactDigest()))
                throw new IllegalStateException("初始内容摘要不一致");
            PreparedDraftRepository.compareLegacy(connection, backup); PreparedDraftRepository.integrity(connection);
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT version FROM flyway_schema_history WHERE success=1 AND version IS NOT NULL ORDER BY installed_rank")) {
                var versions = new java.util.ArrayList<String>(); while (rows.next()) versions.add(rows.getString(1));
                if (!versions.equals(java.util.List.of("1", "2", "3", "4", "5"))) throw new IllegalStateException("迁移版本不完整");
            }
        }
        DraftJournalRepository.Snapshot snapshot;
        try (var connection = HybridSavePreparation.readOnly(database)) {
            DraftJournalRepository.scope(connection, report.request().project_id(), report.request().model_id());
            snapshot = DraftJournalRepository.load(connection, report.request().model_id());
        }
        if (!snapshot.token().equals(report.token()) || !snapshot.checkpointToken().equals(report.token())
                || !DraftJsonDelta.read(snapshot.documentJson()).equals(DraftJsonDelta.read(source(backup, report))))
            throw new IllegalStateException("恢复结果与原始文档不一致");
        return snapshot.documentJson();
    }
}
