package org.opm.localruntime.releaseauthoring.visualcommon;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.application.RuntimeActiveBindingProvider;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseauthoring.GoldenFixtureAttemptCloneVerifier;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** 将已验证的 Common Visual fixture 物化为独立 SQLite V1 base。 */
public final class VisualCommonFixtureMaterializer {

    private static final ObjectMapper JSON = new ObjectMapper();

    public Result materialize(Path fixturePath, Path storageRoot, Path attestationOut, long sourceDateEpoch) {
        try {
            requireFresh(storageRoot, "GOLDEN_COMMON_STORAGE_NOT_EMPTY");
            requireFresh(attestationOut, "GOLDEN_COMMON_STORAGE_NOT_EMPTY");
            JsonNode fixture = JSON.readTree(Files.readAllBytes(fixturePath));
            verifyFixture(fixture, sourceDateEpoch);
            JsonNode revision = fixture.required("revision_document");
            String revisionText = Rfc8785JsonCanonicalizer.canonicalize(revision);
            byte[] revisionBytes = revisionText.getBytes(StandardCharsets.UTF_8);
            String revisionSha256 = sha256(revisionBytes);
            SemanticRevision semantic = new SemanticRevisionReader().read(new ByteArrayInputStream(revisionBytes));
            String projectId = text(fixture.required("project"), "project_id");
            String modelId = text(fixture.required("model"), "model_id");
            if (!projectId.equals(text(fixture.required("model"), "project_id")) || !modelId.equals(semantic.modelId())) {
                throw failure("GOLDEN_COMMON_FIXTURE_REF_MISMATCH", "Fixture identities do not form a closed join.");
            }
            ProjectDatabaseOpenResult opened = new ProjectDatabaseFactory(storageRoot).open(projectId);
            if (!(opened instanceof ProjectDatabaseOpenResult.Ready ready)) {
                throw failure("GOLDEN_COMMON_MIGRATION_FAILED", "SQLite V1 migration did not become ready.");
            }
            Path database = ready.database().databasePath();
            try (Connection connection = connect(database)) {
                beginImmediate(connection);
                try {
                    insertPackages(connection, revision.required("profile_binding"), text(fixture, "generated_at"));
                    insertProject(connection, fixture.required("project"), fixture.required("source_binding"), text(fixture, "generated_at"));
                    insertModel(connection, fixture.required("model"), revision.required("profile_binding"), text(fixture, "generated_at"));
                    insertRevision(connection, revision, revisionText, revisionSha256, text(fixture, "generated_at"));
                    insertHead(connection, modelId, text(revision, "revision_id"), text(fixture, "generated_at"));
                    insertIndexes(connection, fixture.required("index_seed"));
                    verifyStaged(connection, fixture, revisionSha256);
                    connection.createStatement().execute("COMMIT");
                } catch (Exception exception) {
                    connection.createStatement().execute("ROLLBACK");
                    throw exception;
                }
            }
            Map<String, Integer> counts = verifyReopen(database, fixture, revisionSha256);
            String databaseSha256 = sha256(Files.readAllBytes(database));
            String semanticState = Rfc8785JsonCanonicalizer.sha256(Map.of(
                    "storage_schema_version", "1.0", "project_id", projectId, "model_id", modelId,
                    "revision_id", text(revision, "revision_id"), "revision_sequence", 1,
                    "draft_head_revision_id", text(revision, "revision_id"), "head_sequence", 1,
                    "source_binding", JSON.convertValue(fixture.required("source_binding"), Map.class),
                    "revision_document_sha256", revisionSha256, "index_counts", counts));
            writeAttestation(attestationOut, fixturePath, fixture, database, storageRoot, databaseSha256, semanticState, counts, sourceDateEpoch);
            return new Result(projectId, modelId, text(revision, "revision_id"), database, databaseSha256, semanticState, counts);
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_INTERNAL_ERROR", "Common Visual materialization failed.", exception);
        }
    }

    /** 从已验证 base 创建单个 fresh attempt clone，并确认 base 未被修改。 */
    public CloneResult cloneAttempt(Result base, Path attemptStorage) {
        return cloneAttempt(base.databasePath().getParent().getParent().getParent(), base.projectId(), base.databaseSha256(), attemptStorage);
    }

    /** 从经过 attestation 复核的 storage 创建一个隔离 clone。 */
    public CloneResult cloneAttempt(Path baseStorage, String projectId, String expectedDatabaseSha256, Path attemptStorage) {
        try {
            String before = treeDigest(baseStorage);
            GoldenFixtureAttemptCloneVerifier.AttemptClone clone = new GoldenFixtureAttemptCloneVerifier()
                    .cloneStorage(baseStorage, projectId, expectedDatabaseSha256, attemptStorage);
            String after = treeDigest(baseStorage);
            if (!before.equals(after)) throw failure("GOLDEN_COMMON_CLONE_FAILED", "Clone changed immutable base storage.");
            return new CloneResult(clone.databasePath(), before);
        } catch (GoldenFixtureMaterializationException exception) {
            throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_CLONE_FAILED", "Cannot create Common Visual attempt clone.", exception);
        } catch (Exception exception) {
            throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_CLONE_FAILED", "Cannot create Common Visual attempt clone.", exception);
        }
    }

    private void verifyFixture(JsonNode fixture, long epoch) throws Exception {
        if (!fixture.isObject() || !"OPM-DEV-CANVAS-06-COMMON-VISUAL-FIXTURE-001".equals(text(fixture, "schema_id"))
                || !"0.1".equals(text(fixture, "schema_version")) || !"0.1.0".equals(text(fixture, "fixture_version"))
                || Instant.parse(text(fixture, "generated_at")).getEpochSecond() != epoch
                || Instant.parse(text(fixture, "generated_at")).getNano() != 0) {
            throw failure("GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID", "Fixture header or epoch is invalid.");
        }
        ObjectNode payload = ((ObjectNode) fixture).deepCopy();
        String digest = text(payload, "fixture_payload_sha256"); payload.remove("fixture_payload_sha256");
        if (!digest.equals(Rfc8785JsonCanonicalizer.sha256(payload))) throw failure("GOLDEN_COMMON_FIXTURE_REF_MISMATCH", "Fixture payload digest differs.");
        ObjectNode revision = ((ObjectNode) fixture.required("revision_document")).deepCopy();
        String revisionDigest = text(revision.required("revision_digest"), "digest"); revision.remove("revision_digest");
        if (!revisionDigest.equals(Rfc8785JsonCanonicalizer.sha256(revision))) throw failure("GOLDEN_COMMON_FIXTURE_REF_MISMATCH", "Revision digest differs.");
        verifyBinding(fixture.required("source_binding"), fixture.required("revision_document").required("profile_binding"));
    }

    private void verifyBinding(JsonNode source, JsonNode revision) {
        SemanticRevision.ProfileBinding active = RuntimeActiveBindingProvider.current();
        verifyAsset(source.required("profile"), revision.required("profile"), active.profile());
        verifyAsset(source.required("rule_set"), revision.required("rule_set"), active.ruleSet());
        verifyAsset(source.required("text_grammar"), revision.required("text_grammar"), active.textGrammar());
        verifyAsset(source.required("symbol_catalog"), revision.required("symbol_catalog"), active.symbolCatalog());
        verifyAsset(source.required("normalization_adapter"), revision.required("normalization_adapter"), active.normalizationAdapter());
        if (!text(source, "binding_digest").equals(text(revision.required("binding_digest"), "digest"))
                || !text(source, "binding_digest").equals(active.bindingDigest())) throw failure("GOLDEN_COMMON_BINDING_MISMATCH", "Fixture binding differs from active Runtime binding.");
    }

    private void verifyAsset(JsonNode source, JsonNode revision, SemanticRevision.AssetReference active) {
        if (!text(source, "id").equals(active.id()) || !text(source, "version").equals(active.version()) || !text(source, "sha256").equals(active.sha256())
                || !text(revision, "id").equals(active.id()) || !text(revision, "version").equals(active.version()) || !text(revision.required("digest"), "digest").equals(active.sha256())) {
            throw failure("GOLDEN_COMMON_BINDING_MISMATCH", "Fixture asset differs from active Runtime binding.");
        }
    }

    private Connection connect(Path database) throws Exception { Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database + "?foreign_keys=on"); connection.createStatement().execute("PRAGMA foreign_keys = ON"); return connection; }
    private void beginImmediate(Connection connection) throws Exception { connection.createStatement().execute("BEGIN IMMEDIATE"); }

    private void insertPackages(Connection c, JsonNode b, String at) throws Exception {
        packageRow(c, "INSERT INTO profile_package VALUES (?, ?, ?, 'DRAFT', ?, ?)", b.required("profile"), at);
        packageRow(c, "INSERT INTO rule_set_package VALUES (?, ?, ?, 'DRAFT', ?, ?)", b.required("rule_set"), at);
        packageRow(c, "INSERT INTO grammar_package VALUES (?, ?, ?, 'OPL', ?, ?)", b.required("text_grammar"), at);
    }

    private void packageRow(Connection c, String sql, JsonNode asset, String at) throws Exception { try (PreparedStatement s = c.prepareStatement(sql)) { s.setString(1, text(asset, "id")); s.setString(2, text(asset, "version")); s.setString(3, text(asset.required("digest"), "digest")); s.setString(4, Rfc8785JsonCanonicalizer.canonicalize(Map.of("source", "VISUAL_COMMON_FIXTURE"))); s.setString(5, at); s.executeUpdate(); } }

    private void insertProject(Connection c, JsonNode p, JsonNode binding, String at) throws Exception { try (PreparedStatement s = c.prepareStatement("INSERT INTO project_metadata VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")) { s.setString(1,text(p,"project_id"));s.setString(2,text(p,"name"));s.setString(3,text(p,"normalized_name"));s.setString(4,text(p,"description"));s.setString(5,text(p,"status"));s.setString(6,text(binding.required("profile"),"id"));s.setString(7,text(binding.required("profile"),"version"));s.setString(8,at);s.setString(9,at);s.executeUpdate(); } }
    private void insertModel(Connection c, JsonNode m, JsonNode binding, String at) throws Exception { try (PreparedStatement s = c.prepareStatement("INSERT INTO model_catalog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")) { s.setString(1,text(m,"model_id"));s.setString(2,text(m,"project_id"));s.setString(3,text(m,"name"));s.setString(4,text(m,"normalized_name"));s.setString(5,text(m,"description"));s.setString(6,text(m,"status"));s.setString(7,Rfc8785JsonCanonicalizer.canonicalize(binding));s.setString(8,at);s.setString(9,at);s.executeUpdate(); } }
    private void insertRevision(Connection c, JsonNode r, String json, String digest, String at) throws Exception { JsonNode b=r.required("profile_binding"); try (PreparedStatement s=c.prepareStatement("INSERT INTO revision_document(revision_id,model_id,revision_sequence,schema_version,profile_id,profile_version,rule_set_id,rule_set_version,schema_set_json,profile_binding_json,document_json,document_digest,commit_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")){s.setString(1,text(r,"revision_id"));s.setString(2,text(r,"model_id"));s.setInt(3,r.required("revision_sequence").intValue());s.setString(4,text(r,"schema_version"));s.setString(5,text(b.required("profile"),"id"));s.setString(6,text(b.required("profile"),"version"));s.setString(7,text(b.required("rule_set"),"id"));s.setString(8,text(b.required("rule_set"),"version"));s.setString(9,Rfc8785JsonCanonicalizer.canonicalize(r.required("schema_set_ref")));s.setString(10,Rfc8785JsonCanonicalizer.canonicalize(b));s.setString(11,json);s.setString(12,digest);s.setString(13,"VISUAL_COMMON_FIXTURE_MATERIALIZED");s.setString(14,at);s.executeUpdate();} }
    private void insertHead(Connection c,String model,String revision,String at)throws Exception{try(PreparedStatement s=c.prepareStatement("INSERT INTO model_head VALUES (?,?,?,?)")){s.setString(1,model);s.setString(2,revision);s.setInt(3,1);s.setString(4,at);s.executeUpdate();}}

    private void insertIndexes(Connection c, JsonNode seed) throws Exception { rows(c,"element_index",seed.required("element_index"),new String[]{"source_revision_id","model_id","element_id","core_kind","capability_id","normalized_name"});rows(c,"fact_endpoint_index",seed.required("fact_endpoint_index"),new String[]{"source_revision_id","model_id","fact_id","endpoint_id","endpoint_role","target_entity_id","ordinal"});rows(c,"occurrence_index",seed.required("occurrence_index"),new String[]{"source_revision_id","model_id","context_id","occurrence_id","target_entity_id","ownership"});rows(c,"finding_index",seed.required("finding_index"),new String[]{"source_revision_id","model_id","finding_id","rule_id","severity","category","context_id","entity_id"});rows(c,"operation_record",seed.required("operation_record"),new String[]{"operation_record_id","project_id","model_id","operation_id","aggregate_id","command_id","input_revision_id","result_revision_id","result_status","diagnostic_id","occurred_at"}); }
    private void rows(Connection c,String table,JsonNode rows,String[] fields)throws Exception{String sql="INSERT INTO "+table+" ("+String.join(",",fields)+") VALUES ("+"?,".repeat(fields.length-1)+"?)";try(PreparedStatement s=c.prepareStatement(sql)){for(JsonNode row:rows){for(int i=0;i<fields.length;i++){JsonNode v=row.get(fields[i]);if(v==null||v.isNull())s.setObject(i+1,null);else if(v.isInt())s.setInt(i+1,v.intValue());else s.setString(i+1,v.asText());}s.addBatch();}s.executeBatch();}}
    private void verifyStaged(Connection c,JsonNode fixture,String digest)throws Exception{try(ResultSet r=c.createStatement().executeQuery("SELECT document_digest FROM revision_document")){if(!r.next()||!digest.equals(r.getString(1)))throw failure("GOLDEN_COMMON_STORAGE_VERIFY_FAILED","Revision digest differs after insert.");}}
    private Map<String,Integer> verifyReopen(Path database,JsonNode fixture,String digest)throws Exception{Map<String,Integer> counts=new LinkedHashMap<>();try(Connection c=connect(database)){for(String t:new String[]{"revision_document","element_index","fact_endpoint_index","occurrence_index","finding_index","operation_record","text_trace_index"})try(ResultSet r=c.createStatement().executeQuery("SELECT COUNT(*) FROM "+t)){r.next();counts.put(t,r.getInt(1));}try(ResultSet r=c.createStatement().executeQuery("PRAGMA integrity_check")){if(!r.next()||!"ok".equals(r.getString(1)))throw failure("GOLDEN_COMMON_STORAGE_VERIFY_FAILED","SQLite integrity check failed.");}}if(Files.exists(database.resolveSibling("project.db-wal"))||Files.exists(database.resolveSibling("project.db-shm")))throw failure("GOLDEN_COMMON_STORAGE_VERIFY_FAILED","SQLite sidecar exists.");return Map.copyOf(counts);}
    private void writeAttestation(Path out,Path fixturePath,JsonNode fixture,Path database,Path storage,String databaseDigest,String semantic,Map<String,Integer> counts,long epoch)throws Exception{Map<String,Object> v=new LinkedHashMap<>();v.put("contract_version","0.1.0");v.put("subject_id",text(fixture,"subject_id"));v.put("fixture_ref",Map.of("kind","FIXTURE","path",fixturePath.getFileName().toString(),"byte_length",Files.size(fixturePath),"sha256",sha256(Files.readAllBytes(fixturePath))));v.put("project_id",text(fixture.required("project"),"project_id"));v.put("model_id",text(fixture.required("model"),"model_id"));v.put("revision_id",text(fixture.required("revision_document"),"revision_id"));v.put("database_ref",Map.of("kind","DATABASE","path",storage.relativize(database).toString(),"byte_length",Files.size(database),"sha256",databaseDigest));v.put("semantic_state_sha256",semantic);v.put("committed_projection_sha256",Rfc8785JsonCanonicalizer.sha256(fixture.required("expected_projection").required("committed_cells")));v.put("index_counts",counts);v.put("materializer_identity",Map.of("class",getClass().getName()));v.put("source_date_epoch",epoch);Files.createDirectories(out.getParent());Path temp=out.resolveSibling("."+out.getFileName()+".tmp");Files.writeString(temp,Rfc8785JsonCanonicalizer.canonicalize(v)+"\n",StandardCharsets.UTF_8);Files.move(temp,out,StandardCopyOption.ATOMIC_MOVE);}
    private void requireFresh(Path path,String code)throws Exception{if(Files.exists(path))throw failure(code,"Target already exists.");if(Files.isSymbolicLink(path))throw failure(code,"Target must not be a symbolic link.");}
    private String text(JsonNode n,String field){JsonNode value=n.get(field);if(value==null||!value.isTextual())throw failure("GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID","Missing textual field: "+field);return value.asText();}
    private String sha256(byte[] bytes)throws Exception{return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    private String treeDigest(Path root) throws Exception { Map<String, String> files = new java.util.TreeMap<>(); try (var paths = Files.walk(root)) { for (Path path : paths.filter(Files::isRegularFile).toList()) files.put(root.relativize(path).toString(), sha256(Files.readAllBytes(path))); } return Rfc8785JsonCanonicalizer.sha256(files); }
    private GoldenFixtureMaterializationException failure(String code,String message){return new GoldenFixtureMaterializationException(code,message);}
    public record Result(String projectId,String modelId,String revisionId,Path databasePath,String databaseSha256,String semanticStateSha256,Map<String,Integer> indexCounts) { }
    public record CloneResult(Path databasePath, String baseTreeSha256) { }
}
