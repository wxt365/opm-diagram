package org.opm.localruntime.exchange;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExchangePackageImportServiceTest {

    @TempDir
    Path temporary;

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void importsProjectFullIntoNewProjectAndRejectsTheSamePackageDigest() throws Exception {
        Path storage = Files.createDirectory(temporary.resolve("storage"));
        Path packageFile = writeProjectFull();
        ExchangePackageImportService service = service(storage);

        ExchangeImportResult result = service.importNewProject(packageFile);

        assertTrue(result.targetProjectId().startsWith("project.import."));
        assertEquals(List.of("model.golden.proc"), result.modelIds());
        assertEquals(List.of("revision.base.golden.proc.001"), result.revisionIds());
        assertFalse(result.targetProjectId().equals("project.source.demo"));
        assertDatabase(result.databasePath(), result.targetProjectId(), 0);
        assertCode("EXCHANGE_DUPLICATE_PACKAGE", () -> service.importNewProject(packageFile));
        assertEquals(1L, Files.list(storage.resolve("projects")).count());
        assertFalse(Files.exists(storage.resolve(".exchange-staging")));
    }

    @Test
    void importsBaselineAssetWithPreservedModelRevisionAndBaselineIdentity() throws Exception {
        Path storage = Files.createDirectory(temporary.resolve("storage"));
        ExchangeImportResult result = service(storage).importNewProject(writeBaselineAsset());

        assertEquals(List.of("model.golden.proc"), result.modelIds());
        assertEquals(List.of("revision.base.golden.proc.001"), result.revisionIds());
        assertEquals(List.of("baseline.golden.proc.001"), result.baselineIds());
        assertDatabase(result.databasePath(), result.targetProjectId(), 1);
    }

    private ExchangePackageImportService service(Path storage) {
        return new ExchangePackageImportService(storage, new ProfilePackageAssembler(new FileProfilePackageLoader(repositoryFile("packages/profiles"))));
    }

    private Path writeProjectFull() throws Exception {
        Revision fixture = fixture();
        ObjectNode project = json.createObjectNode();
        project.put("project_id", "project.source.demo"); project.put("name", "Imported Project"); project.put("normalized_name", "imported project"); project.putNull("description"); project.put("status", "ACTIVE");
        project.put("default_profile_id", fixture.profileId()); project.put("default_profile_version", fixture.profileVersion()); project.put("created_at", "2026-09-01T00:00:00Z"); project.put("updated_at", "2026-09-01T00:00:00Z");
        ObjectNode head = json.createObjectNode();
        head.put("model_id", fixture.modelId()); head.put("draft_head_revision_id", fixture.revisionId()); head.put("head_sequence", fixture.sequence()); head.put("updated_at", "2026-09-01T00:00:00Z");
        Map<String, byte[]> content = new LinkedHashMap<>();
        content.put("project/project.json", canonical(project));
        content.put("models/" + fixture.modelId() + "/model.json", fixture.modelCatalog());
        content.put("models/" + fixture.modelId() + "/head.json", canonical(head));
        content.put("revisions/" + fixture.modelId() + "/" + fixture.revisionId() + ".json", fixture.raw());
        content.put("evidence/" + fixture.modelId() + "/" + fixture.revisionId() + "/capability-report.json", canonical(json.createObjectNode().put("status", "EVIDENCE_MISSING")));
        List<ExchangePackageManifest.Entry> entries = List.of(
                entry("CAPABILITY_REPORT", "CAPABILITY_REPORT", "evidence/" + fixture.modelId() + "/" + fixture.revisionId() + "/capability-report.json", content, List.of("SEMANTIC_REVISION"), "1.0"),
                entry("MODEL_CATALOG", "MODEL_CATALOG", "models/" + fixture.modelId() + "/model.json", content, List.of(), "1.0"),
                entry("MODEL_HEAD", "ASSET", "models/" + fixture.modelId() + "/head.json", content, List.of("SEMANTIC_REVISION"), "1.0", "OPM-MODEL-HEAD-001"),
                entry("PROJECT_CATALOG", "PROJECT_CATALOG", "project/project.json", content, List.of(), "1.0"),
                entry("SEMANTIC_REVISION", "SEMANTIC_REVISION", "revisions/" + fixture.modelId() + "/" + fixture.revisionId() + ".json", content, List.of("MODEL_CATALOG"), fixture.schemaVersion()));
        return write("PROJECT_FULL", new ExchangePackageManifest.Source("project.source.demo", null, null, null), entries, content);
    }

    private Path writeBaselineAsset() throws Exception {
        Revision fixture = fixture();
        ObjectNode baseline = json.createObjectNode();
        baseline.put("baseline_id", "baseline.golden.proc.001"); baseline.put("model_id", fixture.modelId()); baseline.put("revision_id", fixture.revisionId()); baseline.put("name", "Golden Baseline"); baseline.put("normalized_name", "golden baseline"); baseline.putNull("description"); baseline.put("validation_report_digest", "a".repeat(64)); baseline.set("evidence_summary", json.createObjectNode()); baseline.put("created_at", "2026-09-01T00:00:00Z");
        Map<String, byte[]> content = new LinkedHashMap<>();
        content.put("model/model.json", fixture.modelCatalog());
        content.put("revisions/" + fixture.revisionId() + ".json", fixture.raw());
        content.put("evidence/capability-report.json", canonical(json.createObjectNode().put("status", "EVIDENCE_MISSING")));
        content.put("baselines/baseline.golden.proc.001.json", canonical(baseline));
        List<ExchangePackageManifest.Entry> entries = List.of(
                entry("BASELINE", "BASELINE", "baselines/baseline.golden.proc.001.json", content, List.of("SEMANTIC_REVISION"), "1.0", "OPM-BASELINE-001"),
                entry("CAPABILITY_REPORT", "CAPABILITY_REPORT", "evidence/capability-report.json", content, List.of("SEMANTIC_REVISION"), "1.0"),
                entry("MODEL_CATALOG", "MODEL_CATALOG", "model/model.json", content, List.of(), "1.0"),
                entry("SEMANTIC_REVISION", "SEMANTIC_REVISION", "revisions/" + fixture.revisionId() + ".json", content, List.of("MODEL_CATALOG"), fixture.schemaVersion()));
        return write("BASELINE_ASSET", new ExchangePackageManifest.Source(null, fixture.modelId(), fixture.revisionId(), "baseline.golden.proc.001"), entries, content);
    }

    private Revision fixture() throws Exception {
        byte[] raw = ExchangeJsonCanonicalizer.canonicalize(Files.readAllBytes(repositoryFile("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.proc.001.json")));
        JsonNode root = json.readTree(raw);
        String modelId = root.path("model_id").asText();
        ObjectNode catalog = json.createObjectNode();
        catalog.put("model_id", modelId); catalog.put("name", root.path("model_header").path("name").asText()); catalog.put("normalized_name", root.path("model_header").path("name").asText().toLowerCase(java.util.Locale.ROOT)); catalog.put("description", root.path("model_header").path("description").asText()); catalog.put("status", "ACTIVE"); catalog.set("profile_binding", root.get("profile_binding")); catalog.put("created_at", "2026-09-01T00:00:00Z"); catalog.put("updated_at", "2026-09-01T00:00:00Z");
        return new Revision(raw, canonical(catalog), modelId, root.path("revision_id").asText(), root.path("revision_sequence").asInt(), root.path("schema_version").asText(), root.path("profile_binding").path("profile").path("id").asText(), root.path("profile_binding").path("profile").path("version").asText());
    }

    private Path write(String kind, ExchangePackageManifest.Source source, List<ExchangePackageManifest.Entry> entries, Map<String, byte[]> content) throws Exception {
        ExchangePackageManifest unsigned = new ExchangePackageManifest("package." + kind.toLowerCase(), kind, "2026-09-01T00:00:00Z", new ExchangePackageManifest.Producer("test", "1.0"), "urn:opm:test", source, entries, List.of(), null);
        ExchangePackageManifest manifest = new ExchangePackageManifest(unsigned.packageId(), kind, unsigned.createdAt(), unsigned.producerApplication(), unsigned.identityNamespace(), source, entries, List.of(), unsigned.computedDigest());
        Path target = temporary.resolve(kind.toLowerCase() + ".opmp");
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(target))) {
            put(zip, "manifest.json", manifest.canonicalBytes());
            for (Map.Entry<String, byte[]> entry : content.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) put(zip, entry.getKey(), entry.getValue());
        }
        return target;
    }

    private ExchangePackageManifest.Entry entry(String id, String role, String path, Map<String, byte[]> content, List<String> dependsOn, String version) { return entry(id, role, path, content, dependsOn, version, "SEMANTIC_REVISION".equals(role) ? "MS-REV-001" : "OPM-EXCHANGE-OPAQUE-JSON"); }
    private ExchangePackageManifest.Entry entry(String id, String role, String path, Map<String, byte[]> content, List<String> dependsOn, String version, String schema) { byte[] raw = content.get(path); return new ExchangePackageManifest.Entry(id, role, path, "application/json", new ExchangePackageManifest.SchemaReference(schema, version), true, raw.length, sha256(raw), dependsOn); }
    private void put(ZipOutputStream zip, String path, byte[] raw) throws IOException { ZipEntry entry = new ZipEntry(path); entry.setTime(0L); zip.putNextEntry(entry); zip.write(raw); zip.closeEntry(); }
    private byte[] canonical(JsonNode value) { try { return ExchangeJsonCanonicalizer.canonicalize(json.writeValueAsBytes(value)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private String sha256(byte[] raw) { try { return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private void assertDatabase(Path database, String projectId, int baselines) throws Exception { try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database); var project = connection.prepareStatement("SELECT project_id FROM project_metadata"); var revision = connection.prepareStatement("SELECT revision_id FROM revision_document"); var baseline = connection.prepareStatement("SELECT COUNT(*) FROM baseline")) { try (var rows = project.executeQuery()) { assertTrue(rows.next()); assertEquals(projectId, rows.getString(1)); } try (var rows = revision.executeQuery()) { assertTrue(rows.next()); assertEquals("revision.base.golden.proc.001", rows.getString(1)); } try (var rows = baseline.executeQuery()) { assertTrue(rows.next()); assertEquals(baselines, rows.getInt(1)); } } }
    private void assertCode(String code, Runnable action) { assertEquals(code, assertThrows(ExchangeException.class, action::run).code()); }
    private Path repositoryFile(String relative) { Path current = Path.of("").toAbsolutePath(); while (current != null) { Path candidate = current.resolve(relative); if (Files.exists(candidate)) return candidate; current = current.getParent(); } throw new IllegalStateException("Repository file is missing: " + relative); }

    private record Revision(byte[] raw, byte[] modelCatalog, String modelId, String revisionId, int sequence, String schemaVersion, String profileId, String profileVersion) { }
}
