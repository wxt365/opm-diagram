package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.flywaydb.core.Flyway;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationRequest;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.function.Consumer;

/** 仅测试使用：从 exact fixture 创建临时库并显式启用 V2，不访问用户库。 */
public final class DraftWorkspaceTestDatabase {
    public static final String PROJECT = "project.draft.http", MODEL = "model.golden.proc", CONTEXT = "context.sd.root", NOW = "2026-09-13T00:00:00.000Z";
    private DraftWorkspaceTestDatabase() { }
    /** 仅测试夹具：多图共享语义目标，各有独立 OWNED occurrence 和布局。 */
    public static void addOwnedContext(ObjectNode document, String id, String kind) {
        var rootContext = (ObjectNode) document.at("/contexts/0");
        var context = rootContext.deepCopy().put("context_id", id).put("context_kind", kind);
        ((ObjectNode) context.get("name")).put("local_name", id);
        var ids = context.putArray("occurrence_ids");
        var occurrences = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences");
        var layouts = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts");
        var originalOccurrences = occurrences.deepCopy(); var originalLayouts = layouts.deepCopy();
        for (var occurrence : originalOccurrences) if (occurrence.get("context_id").asText().equals(rootContext.get("context_id").asText())) {
            String occurrenceId = id + "." + occurrence.get("occurrence_id").asText();
            String layoutId = id + "." + occurrence.get("layout_id").asText();
            occurrences.add(((ObjectNode) occurrence).deepCopy().put("occurrence_id", occurrenceId).put("context_id", id).put("layout_id", layoutId));
            ids.add(occurrenceId);
            for (var layout : originalLayouts) if (layout.get("layout_id").equals(occurrence.get("layout_id")))
                layouts.add(((ObjectNode) layout).deepCopy().put("layout_id", layoutId));
        }
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(context);
    }
    public static Path create(Path storage, boolean activate, Consumer<ObjectNode> arrange) throws Exception {
        Path database = storage.resolve("projects/" + PROJECT + "/project.db"); Files.createDirectories(database.getParent());
        var datasource = SqliteConnectionFactory.create(database);
        Flyway.configure().dataSource(datasource).locations("filesystem:" + root().resolve("docs/contracts/migrations/sqlite")).target("3").mixed(true).load().migrate();
        var document = SaveContentDigestV1.read(Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json")));
        ((ObjectNode) document.at("/elements/0")).put("essence", "PHYSICAL").put("affiliation", "ENVIRONMENTAL");
        ((ObjectNode) document.at("/layouts/0")).putArray("route_points").addObject().put("x", -0d).put("y", 23.5);
        arrange.accept(document); SaveContentDigestV1.sha256(document);
        String raw = document.toString(); var binding = document.get("profile_binding");
        try (var connection = datasource.getConnection()) {
            execute(connection, "INSERT INTO project_metadata VALUES (?,?,?,NULL,'ACTIVE',?,?,?,?)", PROJECT, "测试", "test", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), NOW, NOW);
            execute(connection, "INSERT INTO model_catalog VALUES (?,?,?,?,?,'ACTIVE',?,?,?)", MODEL, PROJECT, "模型", "model", "描述", binding.toString(), NOW, NOW);
            execute(connection, "INSERT INTO profile_package VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/profile/digest/digest").asText(), NOW);
            execute(connection, "INSERT INTO rule_set_package VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(), binding.at("/rule_set/digest/digest").asText(), NOW);
            execute(connection, "INSERT INTO revision_document VALUES (?,?,?,'0.2',?,?,?,?,?,?,?,?,'TEST',1,?)", document.get("revision_id").asText(), MODEL, 2,
                    binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(),
                    document.get("schema_set_ref").toString(), binding.toString(), raw, HybridSavePreparation.hash(raw), NOW);
            execute(connection, "INSERT INTO model_head VALUES (?,?,1,?)", MODEL, document.get("revision_id").asText(), NOW);
            connection.setAutoCommit(false);
            PreparedDraftRepository.seed(connection, new DraftPreparationRequest(PROJECT, MODEL, document.get("revision_id").asText(), HybridSavePreparation.hash(raw),
                    binding.at("/binding_digest/digest").asText(), "draft.http", "checkpoint.http", NOW), new PreparedDraftRepository.Source(raw, document), ignored -> { });
            if (activate) execute(connection, "INSERT INTO model_save_mode VALUES (?,'JOURNALED_DRAFT_V2','draft.http')", MODEL);
            connection.commit();
        }
        return database;
    }
    public static long count(Path database, String table) throws Exception {
        if (!java.util.Set.of("draft_journal", "draft_receipt", "draft_content", "draft_checkpoint", "draft_savepoint", "draft_retention", "draft_checkpoint_overlay", "revision_document").contains(table)) throw new IllegalArgumentException();
        try (var connection = SqliteConnectionFactory.create(database).getConnection(); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT count(*) FROM " + table)) { rows.next(); return rows.getLong(1); }
    }
    public static Path root() {
        Path path = Path.of(System.getProperty("user.dir")).toAbsolutePath(); while (path != null && !Files.isDirectory(path.resolve("docs/contracts/migrations/sqlite"))) path = path.getParent();
        if (path == null) throw new IllegalStateException("找不到测试仓库"); return path;
    }
    private static void execute(Connection connection, String sql, Object... values) throws Exception {
        try (var statement = connection.prepareStatement(sql)) { for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]); statement.executeUpdate(); }
    }
}
