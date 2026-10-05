package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationRequest;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationReport;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.List;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;

public class HybridSavePreparationTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String TIME = "2026-09-11T00:00:00.000Z";
    private static final String PROJECT = "project.preparation";
    public record Source(Path path, String raw, DraftPreparationRequest request) { }

    @Test
    void preparesV1AndV2IntoIndependentReadableDraftCopiesWithoutActivatingThem() throws Exception {
        for (String version : List.of("1", "2")) {
            Source source = source("source-" + version, version);
            String before = HybridSavePreparation.hash(source.path());
            Path output = temporary.resolve("prepared-" + version);
            var service = new HybridSavePreparation();
            var report = service.prepare(source.path(), output, migrations(), source.request());
            assertEquals("PREPARED", report.status());
            assertEquals(0L, report.token().edit_seq());
            assertEquals(SaveContentDigestV1.sha256(SaveContentDigestV1.read(source.raw())), report.content_digest());
            assertEquals(report, service.verify(output));
            assertEquals(report, service.prepare(source.path(), output, migrations(), source.request()));
            assertEquals(before, HybridSavePreparation.hash(source.path()));
            try (Connection connection = HybridSavePreparation.readOnly(output.resolve("prepared.sqlite"))) {
                assertEquals("0", scalar(connection, "SELECT count(*) FROM model_save_mode"));
                assertEquals("2", scalar(connection, "SELECT count(*) FROM revision_document"));
                assertEquals("1", scalar(connection, "SELECT count(*) FROM draft_checkpoint"));
                assertEquals("revision.before", scalar(connection, "SELECT revision_id FROM named_snapshot"));
                assertEquals("revision.before", scalar(connection, "SELECT revision_id FROM baseline"));
                assertEquals("1.2", scalar(connection, "SELECT metadata_value FROM schema_metadata WHERE metadata_key='storage_schema_version'"));
                assertEquals(source.raw(), scalar(connection, "SELECT document_json FROM revision_document WHERE revision_sequence=2"));
            }
            try (Connection connection = HybridSavePreparation.readOnly(output.resolve("backup.sqlite"))) {
                assertEquals("0", scalar(connection, "SELECT count(*) FROM sqlite_master WHERE name='draft_stream'"));
                assertEquals(source.raw(), scalar(connection, "SELECT document_json FROM revision_document WHERE revision_sequence=2"));
            }
            assertNull(getClass().getResource("/db/migration/hybrid-save/V3__hybrid_save_foundation.sql"));
            assertNull(getClass().getResource("/db/migration/V3__hybrid_save_foundation.sql"));
        }
    }

    @Test
    void nativeBackupIncludesCommittedWalWithoutChangingSourceDatabaseOrWal() throws Exception {
        Source source = source("wal", "2");
        try (Connection live = SqliteConnectionFactory.create(source.path()).getConnection()) {
            execute(live, "PRAGMA wal_autocheckpoint=0");
            execute(live, "UPDATE project_metadata SET description='WAL_ONLY'");
            Path wal = source.path().resolveSibling(source.path().getFileName() + "-wal");
            assertTrue(Files.size(wal) > 0);
            String beforeDb = HybridSavePreparation.hash(source.path()), beforeWal = HybridSavePreparation.hash(wal);
            Path output = temporary.resolve("wal-prepared");
            new HybridSavePreparation().prepare(source.path(), output, migrations(), source.request());
            assertEquals(beforeDb, HybridSavePreparation.hash(source.path()));
            assertEquals(beforeWal, HybridSavePreparation.hash(wal));
            for (String name : List.of("backup.sqlite", "prepared.sqlite")) {
                try (Connection connection = HybridSavePreparation.readOnly(output.resolve(name))) {
                    assertEquals("WAL_ONLY", scalar(connection, "SELECT description FROM project_metadata"));
                }
                assertFalse(Files.exists(output.resolve(name + "-wal")));
            }
        }
    }

    @Test
    void rejectsStaleIdentityUnknownMigrationAndExistingOrLinkedOutput() throws Exception {
        Source source = source("guards", "2");
        var service = new HybridSavePreparation();
        assertCode("INPUT_INVALID", () -> service.verify(null));
        assertCode("INPUT_INVALID", () -> service.prepare(source.path(), temporary.resolve("null-root"), null, source.request()));
        for (var field : List.of("project_id", "model_id", "expected_revision_id", "expected_document_sha256", "expected_binding_digest")) {
            ObjectNode request = JSON.valueToTree(source.request());
            request.put(field, field.endsWith("sha256") || field.endsWith("digest") ? "b".repeat(64) : "wrong.identity");
            var changed = DraftSaveContract.read(request.toString(), DraftPreparationRequest.class);
            Path output = temporary.resolve("wrong-" + field);
            assertCode("SOURCE_MISMATCH", () -> service.prepare(source.path(), output, migrations(), changed));
            assertFalse(Files.exists(output.resolve("report.json")));
        }
        Path incomplete = Files.createDirectory(temporary.resolve("incomplete"));
        Files.writeString(incomplete.resolve("keep.txt"), "原文件");
        assertCode("OUTPUT_EXISTS", () -> service.prepare(source.path(), incomplete, migrations(), source.request()));
        assertEquals("原文件", Files.readString(incomplete.resolve("keep.txt")));
        Path linked = temporary.resolve("linked"); Files.createSymbolicLink(linked, incomplete);
        assertCode("OUTPUT_EXISTS", () -> service.prepare(source.path(), linked, migrations(), source.request()));
        Path sourceLink = temporary.resolve("source-link.sqlite"); Files.createSymbolicLink(sourceLink, source.path());
        assertCode("INPUT_INVALID", () -> service.prepare(sourceLink, temporary.resolve("reject-link"), migrations(), source.request()));
        assertCode("SCHEMA_MISMATCH", () -> service.prepare(source.path(), temporary.resolve("reject-schema"), temporary, source.request()));
        assertFalse(Files.exists(temporary.resolve("reject-schema")));
        try (Connection connection = writable(source.path())) { execute(connection, "UPDATE schema_metadata SET metadata_value='9.9' WHERE metadata_key='storage_schema_version'"); }
        Path unknown = temporary.resolve("unknown-source");
        assertCode("SCHEMA_MISMATCH", () -> service.prepare(source.path(), unknown, migrations(), source.request()));
        assertFalse(Files.exists(unknown.resolve("report.json")));
    }

    @Test
    void rollsBackEveryInitializationStepAndLeavesNoCompletionReport() throws Exception {
        Source source = source("rollback", "2");
        for (String stage : List.of("CONTENT", "STREAM", "CHECKPOINT")) {
            Path output = temporary.resolve("failure-" + stage);
            var service = new HybridSavePreparation(reached -> { if (stage.equals(reached)) throw new IllegalStateException("测试注入"); });
            assertCode("PERSISTENCE_FAILED", () -> service.prepare(source.path(), output, migrations(), source.request()));
            assertFalse(Files.exists(output.resolve("report.json")));
            try (Connection connection = HybridSavePreparation.readOnly(output.resolve("prepared.sqlite"))) {
                for (String table : List.of("draft_content", "draft_stream", "draft_checkpoint", "model_save_mode")) assertEquals("0", scalar(connection, "SELECT count(*) FROM " + table));
                assertEquals(source.raw(), scalar(connection, "SELECT document_json FROM revision_document WHERE revision_sequence=2"));
            }
            assertCode("OUTPUT_EXISTS", () -> new HybridSavePreparation().prepare(source.path(), output, migrations(), source.request()));
        }
    }

    @Test
    void rejectsChangedReportTokensUnknownFieldsAndRawDatabaseBytes() throws Exception {
        Source source = source("tamper", "2");
        var service = new HybridSavePreparation();
        Path output = temporary.resolve("tampered");
        var report = service.prepare(source.path(), output, migrations(), source.request());
        String raw = Files.readString(output.resolve("report.json"));
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(
                value -> value.put("status", "ACTIVE"), value -> value.put("extra", true),
                value -> ((ObjectNode) value.get("token")).put("edit_seq", 1))) {
            ObjectNode tree = (ObjectNode) JSON.readTree(raw); mutation.accept(tree);
            Files.writeString(output.resolve("report.json"), tree.toString());
            assertCode("CONTENT_MISMATCH", () -> service.verify(output));
        }
        Files.writeString(output.resolve("report.json"), raw);
        assertEquals(report, service.verify(output));
        try (Connection connection = writable(output.resolve("prepared.sqlite"))) { execute(connection, "UPDATE project_metadata SET description='改变文件'"); }
        assertCode("CONTENT_MISMATCH", () -> service.verify(output));
    }

    @Test
    void rejectsLogicalChangesEvenWhenFileHashAndLengthAreRecomputed() throws Exception {
        Source source = source("logical", "2");
        var service = new HybridSavePreparation();
        for (String change : List.of("artifact", "content", "old-data")) {
            Path output = temporary.resolve("logical-" + change);
            service.prepare(source.path(), output, migrations(), source.request());
            try (Connection connection = writable(output.resolve("prepared.sqlite"))) {
                if (change.equals("old-data")) execute(connection, "UPDATE project_metadata SET description='历史被改写'");
                else {
                    execute(connection, "DROP TRIGGER draft_content_no_update");
                    if (change.equals("artifact")) execute(connection, "UPDATE draft_content SET artifact_json='{}'");
                    else execute(connection, "UPDATE draft_content SET model_json=json_set(model_json,'$.model_header.description','丢失保护')");
                }
            }
            ObjectNode report = (ObjectNode) JSON.readTree(Files.readString(output.resolve("report.json")));
            report.put("prepared_sha256", HybridSavePreparation.hash(output.resolve("prepared.sqlite")));
            report.put("prepared_bytes", Files.size(output.resolve("prepared.sqlite")));
            Files.writeString(output.resolve("report.json"), report.toString());
            assertCode("CONTENT_MISMATCH", () -> service.verify(output));
        }
    }

    @Test
    void concurrentPreparationCannotConsumeOrOverwriteAnUncommittedRoot() throws Exception {
        Source source = source("concurrent", "2");
        Path output = temporary.resolve("single-output");
        var entered = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var service = new HybridSavePreparation(stage -> {
            if (!stage.equals("CONTENT")) return;
            entered.countDown();
            try { if (!release.await(10, java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("测试等待超时"); }
            catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
        });
        try (var executor = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> service.prepare(source.path(), output, migrations(), source.request()));
            try {
                assertTrue(entered.await(10, java.util.concurrent.TimeUnit.SECONDS));
                assertCode("OUTPUT_EXISTS", () -> new HybridSavePreparation().prepare(source.path(), output, migrations(), source.request()));
                assertFalse(Files.exists(output.resolve("report.json")));
            } finally { release.countDown(); }
            assertEquals(first.get(10, java.util.concurrent.TimeUnit.SECONDS), new HybridSavePreparation().verify(output));
        }
    }

    private Source source(String name, String version) throws Exception {
        return source(temporary, name, version, ignored -> { });
    }

    public static Source source(Path temporary, String name, String version, Consumer<ObjectNode> arrange) throws Exception {
        Path database = temporary.resolve(name + ".sqlite");
        var dataSource = SqliteConnectionFactory.create(database);
        Flyway.configure().dataSource(dataSource).locations("filesystem:" + migrations()).target(version).mixed(true).load().migrate();
        ObjectNode document = (ObjectNode) JSON.readTree(Files.readString(repository().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json")));
        ((ObjectNode) document.at("/elements/0")).put("essence", "PHYSICAL");
        ObjectNode layout = (ObjectNode) document.at("/layouts/0");
        layout.put("x", -0d).put("y", 0.1);
        layout.putArray("route_points").addObject().put("x", -0d).put("y", 2.5);
        document.put("parent_revision_id", "revision.before");
        arrange.accept(document);
        String raw = JSON.writerWithDefaultPrettyPrinter().writeValueAsString(document) + "\n";
        JsonNode binding = document.required("profile_binding");
        String model = document.required("model_id").asText();
        try (Connection connection = dataSource.getConnection()) {
            execute(connection, "INSERT INTO project_metadata VALUES (?,?,?,NULL,'ACTIVE',?,?,?,?)", PROJECT, "测试项目", "test", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), TIME, TIME);
            execute(connection, "INSERT INTO model_catalog VALUES (?,?,?,?,?,'ACTIVE',?,?,?)", model, PROJECT, "模型", "model", "描述", binding.toString(), TIME, TIME);
            execute(connection, "INSERT INTO profile_package VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/profile/digest/digest").asText(), TIME);
            execute(connection, "INSERT INTO rule_set_package VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(), binding.at("/rule_set/digest/digest").asText(), TIME);
            ObjectNode old = document.deepCopy(); old.put("revision_id", "revision.before").put("revision_sequence", 1); old.remove("parent_revision_id");
            revision(connection, old, old.toString()); revision(connection, document, raw);
            execute(connection, "INSERT INTO model_head VALUES (?,?,7,?)", model, document.get("revision_id").asText(), TIME);
            execute(connection, "INSERT INTO revision_parent VALUES (?,?,'revision.before')", model, document.get("revision_id").asText());
            execute(connection, "INSERT INTO named_snapshot VALUES ('snapshot.before',?,'revision.before','检查点','snapshot',NULL,?)", model, TIME);
            execute(connection, "INSERT INTO baseline VALUES ('baseline.before',?,'revision.before','基线','baseline',NULL,?,'{}',?)", model, "a".repeat(64), TIME);
        }
        return new Source(database, raw, new DraftPreparationRequest(PROJECT, model, document.get("revision_id").asText(), HybridSavePreparation.hash(raw), binding.at("/binding_digest/digest").asText(), "draft.prepared", "checkpoint.initial", TIME));
    }
    private static void revision(Connection connection, ObjectNode document, String raw) throws Exception {
        var binding = document.required("profile_binding");
        execute(connection, "INSERT INTO revision_document VALUES (?,?,?,'0.2',?,?,?,?,?,?,?,?,'TEST',1,?)",
                document.get("revision_id").asText(), document.get("model_id").asText(), document.get("revision_sequence").asText(),
                binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(),
                document.get("schema_set_ref").toString(), binding.toString(), raw, HybridSavePreparation.hash(raw), TIME);
    }
    private static Path repository() {
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (root != null && !Files.isDirectory(root.resolve("docs/contracts/migrations/sqlite"))) root = root.getParent();
        assertNotNull(root); return root;
    }
    private static Path migrations() { return repository().resolve("docs/contracts/migrations/sqlite"); }
    private static Connection writable(Path file) throws Exception { return java.sql.DriverManager.getConnection("jdbc:sqlite:" + file); }
    private static void execute(Connection connection, String sql, String... values) throws Exception {
        try (var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.length; i++) statement.setString(i + 1, values[i]);
            statement.execute();
        }
    }
    private static String scalar(Connection connection, String sql) throws Exception {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) { assertTrue(rows.next()); return rows.getString(1); }
    }
    private static void assertCode(String code, Runnable operation) {
        var failure = assertThrows(HybridSavePreparation.Failure.class, operation::run);
        assertEquals("DRAFT_PREPARATION_" + code, failure.code(), () -> String.valueOf(failure.getCause()));
    }
}
