package org.opm.localruntime.exchange;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.assets.ProfilePackageAssemblyException;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.semantic.RevisionDocumentEnvelope;
import org.opm.localruntime.semantic.RevisionDocumentReaderRouter;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;
import org.opm.localruntime.text.OplGenerationException;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplTextGenerationService;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** EXCHANGE-02 的受控 NEW_PROJECT 导入器；不暴露 HTTP 入口。 */
public final class ExchangePackageImportService {

    private static final String IMPORTER_VERSION = "EXCHANGE-02/1.0";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path storageRoot;
    private final ExchangePackageReader reader;
    private final RevisionDocumentReaderRouter revisionReader;
    private final ProfilePackageAssembler profilePackageAssembler;
    private final SemanticRevisionValidator semanticValidator;
    private final OplTextGenerationService textGenerationService;

    public ExchangePackageImportService(Path storageRoot, ProfilePackageAssembler profilePackageAssembler) {
        this(storageRoot, new ExchangePackageReader(), new RevisionDocumentReaderRouter(), profilePackageAssembler,
                new SemanticRevisionValidator(), new OplTextGenerationService());
    }

    ExchangePackageImportService(Path storageRoot, ExchangePackageReader reader, RevisionDocumentReaderRouter revisionReader,
                                 ProfilePackageAssembler profilePackageAssembler, SemanticRevisionValidator semanticValidator,
                                 OplTextGenerationService textGenerationService) {
        this.storageRoot = Objects.requireNonNull(storageRoot, "storageRoot must not be null").toAbsolutePath().normalize();
        this.reader = Objects.requireNonNull(reader, "reader must not be null");
        this.revisionReader = Objects.requireNonNull(revisionReader, "revisionReader must not be null");
        this.profilePackageAssembler = Objects.requireNonNull(profilePackageAssembler, "profilePackageAssembler must not be null");
        this.semanticValidator = Objects.requireNonNull(semanticValidator, "semanticValidator must not be null");
        this.textGenerationService = Objects.requireNonNull(textGenerationService, "textGenerationService must not be null");
    }

    public synchronized ExchangeImportResult importNewProject(Path packageFile) {
        if (!Files.isDirectory(storageRoot, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(storageRoot)) {
            throw failure("EXCHANGE_PERSISTENCE_FAILED", "Storage root must be an existing regular directory.");
        }
        ExchangePackageInspection inspection = reader.inspect(packageFile);
        ImportPackage source = parse(inspection);
        if (alreadyImported(inspection.manifest().packageDigest())) {
            throw failure("EXCHANGE_DUPLICATE_PACKAGE", "Package digest has already been imported.");
        }
        validate(source);

        String targetProjectId = "project.import." + UUID.randomUUID().toString().replace("-", "");
        Path stagingProject = storageRoot.resolve(".exchange-staging").resolve(inspection.manifest().packageDigest())
                .resolve("projects").resolve(targetProjectId).normalize();
        Path targetProject = storageRoot.resolve("projects").resolve(targetProjectId).normalize();
        if (!stagingProject.startsWith(storageRoot) || !targetProject.startsWith(storageRoot) || Files.exists(targetProject)) {
            throw failure("EXCHANGE_PERSISTENCE_FAILED", "Import target path is invalid or already exists.");
        }
        try {
            requireRegularDirectoryOrAbsent(storageRoot.resolve(".exchange-staging"), "Exchange staging parent");
            requireRegularDirectoryOrAbsent(targetProject.getParent(), "Project storage parent");
            Files.createDirectories(storageRoot.resolve(".exchange-staging"));
            if (Files.exists(stagingProject.getParent().getParent())) {
                throw failure("EXCHANGE_PERSISTENCE_FAILED", "Package staging root already exists.");
            }
            ProjectDatabaseFactory stagingFactory = new ProjectDatabaseFactory(stagingProject.getParent().getParent());
            ProjectDatabaseOpenResult opened = stagingFactory.open(targetProjectId);
            if (!(opened instanceof ProjectDatabaseOpenResult.Ready ready)) {
                throw failure("EXCHANGE_PERSISTENCE_FAILED", "Staging SQLite migration requires recovery.");
            }
            writeStaging(ready.database().databasePath(), source, targetProjectId);
            verifyStaging(ready.database().databasePath(), source, targetProjectId);
            force(ready.database().databasePath());
            Files.createDirectories(targetProject.getParent());
            try {
                Files.move(stagingProject, targetProject, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException exception) {
                throw failure("EXCHANGE_PERSISTENCE_FAILED", "Storage filesystem does not support atomic project install.", exception);
            }
            forceDirectoryWhenSupported(targetProject.getParent());
            cleanup(stagingProject.getParent().getParent());
            deleteIfEmpty(storageRoot.resolve(".exchange-staging"));
            return new ExchangeImportResult(inspection.manifest().packageId(), inspection.manifest().packageDigest(),
                    inspection.manifest().identityNamespace(), targetProjectId, source.models().keySet().stream().sorted().toList(),
                    source.revisions().stream().map(RevisionEntry::id).sorted().toList(), source.baselines().stream().map(BaselineEntry::id).sorted().toList(),
                    targetProject.resolve("project.db"));
        } catch (ExchangeException exception) {
            cleanup(stagingProject.getParent().getParent());
            throw exception;
        } catch (Exception exception) {
            cleanup(stagingProject.getParent().getParent());
            throw failure("EXCHANGE_PERSISTENCE_FAILED", "Cannot import exchange package.", exception);
        }
    }

    private ImportPackage parse(ExchangePackageInspection inspection) {
        String kind = inspection.manifest().packageKind();
        if (!"PROJECT_FULL".equals(kind) && !"BASELINE_ASSET".equals(kind)) {
            throw failure("EXCHANGE_ADAPTER_UNAVAILABLE", "Persistent import only supports PROJECT_FULL and BASELINE_ASSET.");
        }
        Map<String, ExchangePackageManifest.Entry> entries = new LinkedHashMap<>();
        for (ExchangePackageManifest.Entry entry : inspection.manifest().entries()) entries.put(entry.entryId(), entry);
        try {
            return "PROJECT_FULL".equals(kind) ? parseProjectFull(inspection, entries) : parseBaselineAsset(inspection, entries);
        } catch (ExchangeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("EXCHANGE_IMPORT_LAYOUT_INVALID", "Exchange import layout is invalid.", exception);
        }
    }

    private ImportPackage parseProjectFull(ExchangePackageInspection inspection, Map<String, ExchangePackageManifest.Entry> entries) throws Exception {
        ExchangePackageManifest manifest = inspection.manifest();
        ExchangePackageManifest.Entry projectEntry = only(entries, "PROJECT_CATALOG");
        requirePath(projectEntry, "project/project.json");
        ObjectNode project = object(inspection.entry(projectEntry.logicalPath()), "PROJECT_CATALOG");
        exact(project, "project_id", "name", "normalized_name", "description", "status", "default_profile_id", "default_profile_version", "created_at", "updated_at");
        if (!manifest.source().projectId().equals(text(project, "project_id"))) throw semantic("PROJECT_CATALOG project_id differs from Manifest source.");

        Map<String, ModelEntry> models = models(inspection, entries);
        List<RevisionEntry> revisions = revisions(inspection, entries, models);
        Map<String, HeadEntry> heads = heads(inspection, entries, models, revisions, true);
        List<BaselineEntry> baselines = baselines(inspection, entries, models, revisions);
        requireNoOtherRoles(entries, "PROJECT_CATALOG", "MODEL_CATALOG", "SEMANTIC_REVISION", "CAPABILITY_REPORT", "ASSET", "BASELINE");
        return new ImportPackage(manifest, project, models, revisions, heads, baselines);
    }

    private ImportPackage parseBaselineAsset(ExchangePackageInspection inspection, Map<String, ExchangePackageManifest.Entry> entries) throws Exception {
        ExchangePackageManifest manifest = inspection.manifest();
        ExchangePackageManifest.Entry modelEntry = only(entries, "MODEL_CATALOG");
        requirePath(modelEntry, "model/model.json");
        ObjectNode catalog = object(inspection.entry(modelEntry.logicalPath()), "MODEL_CATALOG");
        exact(catalog, "model_id", "name", "normalized_name", "description", "status", "profile_binding", "created_at", "updated_at");
        String modelId = text(catalog, "model_id");
        if (!manifest.source().modelId().equals(modelId)) throw semantic("MODEL_CATALOG model_id differs from Manifest source.");
        Map<String, ModelEntry> models = Map.of(modelId, new ModelEntry(modelId, catalog));
        List<RevisionEntry> revisions = revisions(inspection, entries, models);
        if (revisions.size() != 1 || !manifest.source().revisionId().equals(revisions.getFirst().id())) throw semantic("BASELINE_ASSET revision differs from Manifest source.");
        List<BaselineEntry> baselines = baselines(inspection, entries, models, revisions);
        if (baselines.size() != 1 || !manifest.source().baselineId().equals(baselines.getFirst().id())) throw semantic("BASELINE_ASSET baseline differs from Manifest source.");
        requireNoOtherRoles(entries, "MODEL_CATALOG", "SEMANTIC_REVISION", "CAPABILITY_REPORT", "BASELINE");
        RevisionEntry revision = revisions.getFirst();
        return new ImportPackage(manifest, projectForBaseline(catalog, revision), models, revisions,
                Map.of(modelId, new HeadEntry(modelId, revision.id(), revision.revision().revisionSequence(), revision.createdAt())), baselines);
    }

    private Map<String, ModelEntry> models(ExchangePackageInspection inspection, Map<String, ExchangePackageManifest.Entry> entries) throws Exception {
        Map<String, ModelEntry> models = new LinkedHashMap<>();
        for (ExchangePackageManifest.Entry entry : entries.values().stream().filter(value -> "MODEL_CATALOG".equals(value.entryRole())).toList()) {
            ObjectNode node = object(inspection.entry(entry.logicalPath()), "MODEL_CATALOG");
            exact(node, "model_id", "name", "normalized_name", "description", "status", "profile_binding", "created_at", "updated_at");
            String id = text(node, "model_id");
            requirePath(entry, "models/" + id + "/model.json");
            if (models.put(id, new ModelEntry(id, node)) != null) throw layout("Model catalog is duplicated.");
        }
        if (models.isEmpty()) throw layout("Project package has no models.");
        return Map.copyOf(models);
    }

    private List<RevisionEntry> revisions(ExchangePackageInspection inspection, Map<String, ExchangePackageManifest.Entry> entries,
                                          Map<String, ModelEntry> models) throws Exception {
        List<RevisionEntry> result = new ArrayList<>();
        for (ExchangePackageManifest.Entry entry : entries.values().stream().filter(value -> "SEMANTIC_REVISION".equals(value.entryRole())).toList()) {
            byte[] raw = inspection.entry(entry.logicalPath());
            RevisionDocumentEnvelope envelope = revisionReader.read(raw);
            SemanticRevision revision = envelope.revision();
            ModelEntry model = models.get(revision.modelId());
            if (model == null || !"MS-REV-001".equals(entry.schemaReference().schemaId()) || !envelope.schemaVersion().equals(entry.schemaReference().schemaVersion())) {
                throw semantic("Semantic revision model or schema is invalid.");
            }
            String expectedPath = "BASELINE_ASSET".equals(inspection.manifest().packageKind())
                    ? "revisions/" + revision.revisionId() + ".json"
                    : "revisions/" + revision.modelId() + "/" + revision.revisionId() + ".json";
            requirePath(entry, expectedPath);
            ObjectNode document = object(raw, "SEMANTIC_REVISION");
            if (!document.path("model_header").path("model_id").asText().equals(revision.modelId())
                    || !document.get("profile_binding").equals(model.catalog().get("profile_binding"))) throw semantic("Revision identity or binding differs from MODEL_CATALOG.");
            String reportPath = "BASELINE_ASSET".equals(inspection.manifest().packageKind())
                    ? "evidence/capability-report.json"
                    : "evidence/" + revision.modelId() + "/" + revision.revisionId() + "/capability-report.json";
            ExchangePackageManifest.Entry report = find(entries, "CAPABILITY_REPORT", reportPath);
            if (report == null || !report.dependsOn().contains(entry.entryId())) throw layout("Capability report is missing or does not depend on its revision.");
            result.add(new RevisionEntry(revision.revisionId(), revision.modelId(), raw, document, revision, nullableText(document, "parent_revision_id"), inspection.manifest().createdAt()));
        }
        if (result.isEmpty()) throw layout("Project package has no revisions.");
        if (entries.values().stream().filter(value -> "CAPABILITY_REPORT".equals(value.entryRole())).count() != result.size()) {
            throw layout("Every revision must have exactly one capability report.");
        }
        Map<String, List<RevisionEntry>> byModel = new LinkedHashMap<>();
        for (RevisionEntry item : result) byModel.computeIfAbsent(item.modelId(), ignored -> new ArrayList<>()).add(item);
        if (!byModel.keySet().equals(models.keySet())) throw layout("Every model must include revisions.");
        for (List<RevisionEntry> modelRevisions : byModel.values()) {
            List<Integer> sequences = modelRevisions.stream().map(item -> item.revision().revisionSequence()).sorted().toList();
            for (int index = 0; index < sequences.size(); index++) if (sequences.get(index) != index + 1) throw semantic("Revision sequence must be contiguous from one.");
            Map<String, RevisionEntry> known = modelRevisions.stream().collect(java.util.stream.Collectors.toMap(RevisionEntry::id, item -> item));
            for (RevisionEntry item : modelRevisions) {
                if (item.revision().revisionSequence() == 1 && item.parentRevisionId() != null) throw semantic("Initial revision must not have a parent.");
                if (item.parentRevisionId() != null) {
                    RevisionEntry parent = known.get(item.parentRevisionId());
                    if (parent == null || parent.revision().revisionSequence() >= item.revision().revisionSequence()) throw semantic("Revision parent is outside its earlier package history.");
                }
            }
        }
        return result.stream().sorted(Comparator.comparing(RevisionEntry::modelId).thenComparingInt(item -> item.revision().revisionSequence())).toList();
    }

    private Map<String, HeadEntry> heads(ExchangePackageInspection inspection, Map<String, ExchangePackageManifest.Entry> entries,
                                         Map<String, ModelEntry> models, List<RevisionEntry> revisions, boolean required) throws Exception {
        Map<String, HeadEntry> heads = new LinkedHashMap<>();
        for (ExchangePackageManifest.Entry entry : entries.values().stream().filter(value -> "ASSET".equals(value.entryRole())).toList()) {
            if (!"OPM-MODEL-HEAD-001".equals(entry.schemaReference().schemaId()) || !"1.0".equals(entry.schemaReference().schemaVersion())) throw layout("ASSET must be a model head.");
            ObjectNode node = object(inspection.entry(entry.logicalPath()), "MODEL_HEAD");
            exact(node, "model_id", "draft_head_revision_id", "head_sequence", "updated_at");
            String modelId = text(node, "model_id"); requirePath(entry, "models/" + modelId + "/head.json");
            HeadEntry value = new HeadEntry(modelId, text(node, "draft_head_revision_id"), positive(node, "head_sequence"), text(node, "updated_at"));
            if (heads.put(modelId, value) != null) throw layout("Model head is duplicated.");
        }
        if (required && !heads.keySet().equals(models.keySet())) throw layout("Every model needs exactly one head.");
        for (HeadEntry head : heads.values()) {
            RevisionEntry revision = revisions.stream().filter(item -> item.modelId().equals(head.modelId()) && item.id().equals(head.revisionId())).findFirst().orElseThrow(() -> layout("Model head revision is absent."));
            if (head.sequence() != revision.revision().revisionSequence()) throw semantic("Model head sequence differs from revision.");
        }
        return Map.copyOf(heads);
    }

    private List<BaselineEntry> baselines(ExchangePackageInspection inspection, Map<String, ExchangePackageManifest.Entry> entries,
                                          Map<String, ModelEntry> models, List<RevisionEntry> revisions) throws Exception {
        List<BaselineEntry> result = new ArrayList<>();
        for (ExchangePackageManifest.Entry entry : entries.values().stream().filter(value -> "BASELINE".equals(value.entryRole())).toList()) {
            if (!"OPM-BASELINE-001".equals(entry.schemaReference().schemaId()) || !"1.0".equals(entry.schemaReference().schemaVersion())) throw layout("Baseline schema is invalid.");
            ObjectNode node = object(inspection.entry(entry.logicalPath()), "BASELINE");
            exact(node, "baseline_id", "model_id", "revision_id", "name", "normalized_name", "description", "validation_report_digest", "evidence_summary", "created_at");
            String id = text(node, "baseline_id"); requirePath(entry, "baselines/" + id + ".json");
            String modelId = text(node, "model_id"); String revisionId = text(node, "revision_id");
            if (!models.containsKey(modelId) || revisions.stream().noneMatch(value -> modelId.equals(value.modelId()) && revisionId.equals(value.id())) || !entry.dependsOn().stream().anyMatch(value -> entries.get(value).entryRole().equals("SEMANTIC_REVISION"))) throw semantic("Baseline does not reference a package revision.");
            result.add(new BaselineEntry(id, modelId, revisionId, node));
        }
        return result.stream().sorted(Comparator.comparing(BaselineEntry::id)).toList();
    }

    private void validate(ImportPackage source) {
        for (RevisionEntry entry : source.revisions()) {
            if (!semanticValidator.validate(entry.revision()).isEmpty()) throw failure("EXCHANGE_VALIDATION_BLOCKED", "Semantic revision violates validation rules.");
            try {
                OplGenerationResult generated = textGenerationService.generate(entry.revision(), entry.revision().rootContextId(),
                        profilePackageAssembler.assemble(entry.revision().profileBinding()));
                if (generated.artifact().artifactDigest().isBlank() || generated.traces().stream().anyMatch(trace -> trace.bindingDigest().isBlank())) {
                    throw failure("EXCHANGE_TEXT_TRACE_BLOCKED", "Generated text or trace is incomplete.");
                }
            } catch (ProfilePackageAssemblyException exception) {
                throw failure("EXCHANGE_PROFILE_BINDING_MISMATCH", "Profile binding is not exactly available.", exception);
            } catch (OplGenerationException | IllegalArgumentException exception) {
                throw failure("EXCHANGE_TEXT_TRACE_BLOCKED", "Text or trace cannot be regenerated.", exception);
            }
        }
    }

    private void writeStaging(Path database, ImportPackage source, String targetProjectId) throws Exception {
        try (Connection connection = connect(database)) {
            connection.setAutoCommit(false);
            try {
                insertPackages(connection, source.revisions());
                insertProject(connection, source.project(), targetProjectId);
                for (ModelEntry model : source.models().values()) insertModel(connection, model, targetProjectId);
                for (RevisionEntry revision : source.revisions()) insertRevision(connection, revision);
                for (RevisionEntry revision : source.revisions()) insertParent(connection, revision);
                for (HeadEntry head : source.heads().values()) insertHead(connection, head);
                for (BaselineEntry baseline : source.baselines()) insertBaseline(connection, baseline);
                for (RevisionEntry revision : source.revisions()) insertIndexes(connection, revision);
                insertOrigin(connection, source.manifest(), targetProjectId);
                insertIdentityMap(connection, source.manifest(), source, targetProjectId);
                connection.commit();
            } catch (Exception exception) {
                connection.rollback();
                throw exception;
            }
        }
    }

    private void insertPackages(Connection connection, List<RevisionEntry> revisions) throws Exception {
        Map<String, SemanticRevision.AssetReference> profiles = new LinkedHashMap<>();
        Map<String, SemanticRevision.AssetReference> rules = new LinkedHashMap<>();
        Map<String, SemanticRevision.AssetReference> grammars = new LinkedHashMap<>();
        for (RevisionEntry entry : revisions) {
            SemanticRevision.ProfileBinding binding = entry.revision().profileBinding();
            profiles.put(binding.profile().id() + "\u001f" + binding.profile().version(), binding.profile());
            rules.put(binding.ruleSet().id() + "\u001f" + binding.ruleSet().version(), binding.ruleSet());
            grammars.put(binding.textGrammar().id() + "\u001f" + binding.textGrammar().version(), binding.textGrammar());
        }
        for (SemanticRevision.AssetReference reference : profiles.values()) insertPackage(connection, "profile_package", "profile_id", "package_version", "package_digest", reference, "package_json", null);
        for (SemanticRevision.AssetReference reference : rules.values()) insertPackage(connection, "rule_set_package", "rule_set_id", "rule_set_version", "rule_set_digest", reference, "package_json", null);
        for (SemanticRevision.AssetReference reference : grammars.values()) insertPackage(connection, "grammar_package", "grammar_id", "grammar_version", "grammar_digest", reference, "manifest_json", "OPL");
    }

    private void insertPackage(Connection connection, String table, String idColumn, String versionColumn, String digestColumn,
                               SemanticRevision.AssetReference reference, String jsonColumn, String modality) throws Exception {
        String sql = modality == null
                ? "INSERT INTO " + table + "(" + idColumn + "," + versionColumn + "," + digestColumn + ",lifecycle_status," + jsonColumn + ",installed_at) VALUES (?,?,?,'DRAFT',?,?)"
                : "INSERT INTO " + table + "(" + idColumn + "," + versionColumn + "," + digestColumn + ",text_modality," + jsonColumn + ",installed_at) VALUES (?,?,?,? ,?,?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, reference.id()); statement.setString(2, reference.version()); statement.setString(3, reference.sha256());
            int jsonIndex = 4;
            if (modality != null) { statement.setString(4, modality); jsonIndex = 5; }
            statement.setString(jsonIndex, "{\"source\":\"OPM_NATIVE_EXCHANGE\"}"); statement.setString(jsonIndex + 1, Instant.now().toString()); statement.executeUpdate();
        }
    }

    private void insertProject(Connection connection, ObjectNode project, String targetProjectId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO project_metadata(project_id,name,normalized_name,description,status,default_profile_id,default_profile_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")) {
            statement.setString(1, targetProjectId); statement.setString(2, text(project, "name")); statement.setString(3, text(project, "normalized_name")); nullable(statement, 4, project.get("description"));
            statement.setString(5, "ACTIVE"); statement.setString(6, text(project, "default_profile_id")); statement.setString(7, text(project, "default_profile_version")); statement.setString(8, text(project, "created_at")); statement.setString(9, text(project, "updated_at")); statement.executeUpdate();
        }
    }

    private void insertModel(Connection connection, ModelEntry model, String targetProjectId) throws Exception {
        ObjectNode node = model.catalog();
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO model_catalog(model_id,project_id,name,normalized_name,description,status,profile_binding_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")) {
            statement.setString(1, model.id()); statement.setString(2, targetProjectId); statement.setString(3, text(node, "name")); statement.setString(4, text(node, "normalized_name")); nullable(statement, 5, node.get("description"));
            statement.setString(6, "ACTIVE"); statement.setString(7, canonical(node.get("profile_binding"))); statement.setString(8, text(node, "created_at")); statement.setString(9, text(node, "updated_at")); statement.executeUpdate();
        }
    }

    private void insertRevision(Connection connection, RevisionEntry entry) throws Exception {
        SemanticRevision revision = entry.revision(); SemanticRevision.ProfileBinding binding = revision.profileBinding();
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO revision_document(revision_id,model_id,revision_sequence,schema_version,profile_id,profile_version,rule_set_id,rule_set_version,schema_set_json,profile_binding_json,document_json,document_digest,commit_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")) {
            statement.setString(1, entry.id()); statement.setString(2, entry.modelId()); statement.setInt(3, revision.revisionSequence()); statement.setString(4, entry.document().path("schema_version").asText());
            statement.setString(5, binding.profile().id()); statement.setString(6, binding.profile().version()); statement.setString(7, binding.ruleSet().id()); statement.setString(8, binding.ruleSet().version());
            statement.setString(9, canonical(entry.document().get("schema_set_ref"))); statement.setString(10, canonical(entry.document().get("profile_binding")));
            statement.setString(11, new String(entry.raw(), java.nio.charset.StandardCharsets.UTF_8)); statement.setString(12, sha256(entry.raw())); statement.setString(13, "OPM_NATIVE_EXCHANGE_IMPORT"); statement.setString(14, entry.createdAt()); statement.executeUpdate();
        }
    }

    private void insertParent(Connection connection, RevisionEntry entry) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO revision_parent(model_id,revision_id,parent_revision_id) VALUES (?,?,?)")) {
            statement.setString(1, entry.modelId()); statement.setString(2, entry.id()); statement.setString(3, entry.parentRevisionId()); statement.executeUpdate();
        }
    }

    private void insertHead(Connection connection, HeadEntry entry) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO model_head(model_id,draft_head_revision_id,head_sequence,updated_at) VALUES (?,?,?,?)")) {
            statement.setString(1, entry.modelId()); statement.setString(2, entry.revisionId()); statement.setInt(3, entry.sequence()); statement.setString(4, entry.updatedAt()); statement.executeUpdate();
        }
    }

    private void insertBaseline(Connection connection, BaselineEntry entry) throws Exception {
        ObjectNode node = entry.node();
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO baseline(baseline_id,model_id,revision_id,name,normalized_name,description,validation_report_digest,evidence_summary_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")) {
            statement.setString(1, entry.id()); statement.setString(2, entry.modelId()); statement.setString(3, entry.revisionId()); statement.setString(4, text(node, "name")); statement.setString(5, text(node, "normalized_name")); nullable(statement, 6, node.get("description"));
            statement.setString(7, text(node, "validation_report_digest")); statement.setString(8, canonical(node.get("evidence_summary"))); statement.setString(9, text(node, "created_at")); statement.executeUpdate();
        }
    }

    private void insertIndexes(Connection connection, RevisionEntry entry) throws Exception {
        SemanticRevision revision = entry.revision();
        try (PreparedStatement elements = connection.prepareStatement("INSERT INTO element_index(source_revision_id,model_id,element_id,core_kind,capability_id,normalized_name) VALUES (?,?,?,?,?,?)")) {
            for (SemanticRevision.Element element : revision.elements()) { elements.setString(1, entry.id()); elements.setString(2, entry.modelId()); elements.setString(3, element.id()); elements.setString(4, element.coreKind().name()); elements.setString(5, element.capability().capabilityId()); elements.setString(6, element.name().localName().toLowerCase(java.util.Locale.ROOT)); elements.addBatch(); }
            elements.executeBatch();
        }
        try (PreparedStatement endpoints = connection.prepareStatement("INSERT INTO fact_endpoint_index(source_revision_id,model_id,fact_id,endpoint_id,endpoint_role,target_entity_id,ordinal) VALUES (?,?,?,?,?,?,?)")) {
            for (SemanticRevision.Fact fact : revision.facts()) for (SemanticRevision.Endpoint endpoint : fact.endpoints()) { endpoints.setString(1, entry.id()); endpoints.setString(2, entry.modelId()); endpoints.setString(3, fact.id()); endpoints.setString(4, endpoint.id()); endpoints.setString(5, endpoint.role()); endpoints.setString(6, endpoint.targetId()); endpoints.setInt(7, endpoint.ordinal()); endpoints.addBatch(); }
            endpoints.executeBatch();
        }
        try (PreparedStatement occurrences = connection.prepareStatement("INSERT INTO occurrence_index(source_revision_id,model_id,context_id,occurrence_id,target_entity_id,ownership) VALUES (?,?,?,?,?,?)")) {
            for (SemanticRevision.Occurrence occurrence : revision.occurrences()) { occurrences.setString(1, entry.id()); occurrences.setString(2, entry.modelId()); occurrences.setString(3, occurrence.contextId()); occurrences.setString(4, occurrence.id()); occurrences.setString(5, occurrence.targetId()); occurrences.setString(6, occurrence.ownership().name()); occurrences.addBatch(); }
            occurrences.executeBatch();
        }
    }

    private void insertOrigin(Connection connection, ExchangePackageManifest manifest, String targetProjectId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO exchange_import_origin(package_digest,package_id,package_kind,source_namespace,source_project_id,source_model_id,source_revision_id,source_baseline_id,target_project_id,importer_version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            statement.setString(1, manifest.packageDigest()); statement.setString(2, manifest.packageId()); statement.setString(3, manifest.packageKind()); statement.setString(4, manifest.identityNamespace());
            statement.setString(5, manifest.source().projectId()); statement.setString(6, manifest.source().modelId()); statement.setString(7, manifest.source().revisionId()); statement.setString(8, manifest.source().baselineId());
            statement.setString(9, targetProjectId); statement.setString(10, IMPORTER_VERSION); statement.setString(11, Instant.now().toString()); statement.executeUpdate();
        }
    }

    private void insertIdentityMap(Connection connection, ExchangePackageManifest manifest, ImportPackage source, String targetProjectId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO exchange_identity_map(package_digest,source_namespace,source_id,target_id,reason) VALUES (?,?,?,?,?)")) {
            if (manifest.source().projectId() != null) map(statement, manifest, manifest.source().projectId(), targetProjectId, "NEW_PROJECT");
            for (String model : source.models().keySet()) map(statement, manifest, model, model, "PRESERVED");
            for (RevisionEntry revision : source.revisions()) map(statement, manifest, revision.id(), revision.id(), "PRESERVED");
            for (BaselineEntry baseline : source.baselines()) map(statement, manifest, baseline.id(), baseline.id(), "PRESERVED");
        }
    }

    private void map(PreparedStatement statement, ExchangePackageManifest manifest, String sourceId, String targetId, String reason) throws Exception {
        statement.setString(1, manifest.packageDigest()); statement.setString(2, manifest.identityNamespace()); statement.setString(3, sourceId); statement.setString(4, targetId); statement.setString(5, reason); statement.executeUpdate();
    }

    private void verifyStaging(Path database, ImportPackage source, String targetProjectId) throws Exception {
        try (Connection connection = connect(database)) {
            try (ResultSet result = connection.createStatement().executeQuery("PRAGMA integrity_check")) { if (!result.next() || !"ok".equals(result.getString(1))) throw failure("EXCHANGE_PERSISTENCE_FAILED", "SQLite integrity check failed."); }
            try (ResultSet result = connection.createStatement().executeQuery("PRAGMA foreign_key_check")) { if (result.next()) throw failure("EXCHANGE_PERSISTENCE_FAILED", "SQLite foreign key check failed."); }
            try (PreparedStatement statement = connection.prepareStatement("SELECT project_id FROM project_metadata WHERE project_id = ?")) { statement.setString(1, targetProjectId); try (ResultSet result = statement.executeQuery()) { if (!result.next()) throw failure("EXCHANGE_PERSISTENCE_FAILED", "Imported Project is missing."); } }
            for (RevisionEntry revision : source.revisions()) try (PreparedStatement statement = connection.prepareStatement("SELECT document_json,document_digest FROM revision_document WHERE revision_id=?")) {
                statement.setString(1, revision.id()); try (ResultSet result = statement.executeQuery()) { if (!result.next() || !sha256(revision.raw()).equals(result.getString(2)) || !revisionReader.read(result.getString(1).getBytes(java.nio.charset.StandardCharsets.UTF_8)).revision().revisionId().equals(revision.id())) throw failure("EXCHANGE_PERSISTENCE_FAILED", "Imported Revision readback differs."); }
            }
        }
    }

    private boolean alreadyImported(String packageDigest) {
        Path projects = storageRoot.resolve("projects");
        if (!Files.isDirectory(projects, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(projects)) return false;
        try (var directories = Files.list(projects)) {
            for (Path directory : directories.toList()) {
                Path database = directory.resolve("project.db");
                if (Files.isSymbolicLink(directory) || !Files.isRegularFile(database, LinkOption.NOFOLLOW_LINKS)) continue;
                try (Connection connection = connect(database);
                     PreparedStatement statement = connection.prepareStatement("SELECT 1 FROM sqlite_master WHERE type='table' AND name='exchange_import_origin'")) {
                    try (ResultSet table = statement.executeQuery()) {
                        if (!table.next()) continue;
                    }
                    try (PreparedStatement origin = connection.prepareStatement("SELECT 1 FROM exchange_import_origin WHERE package_digest=?")) {
                        origin.setString(1, packageDigest); try (ResultSet result = origin.executeQuery()) { if (result.next()) return true; }
                    }
                }
            }
            return false;
        } catch (Exception exception) {
            throw failure("EXCHANGE_PERSISTENCE_FAILED", "Cannot inspect installed import origins.", exception);
        }
    }

    private ObjectNode projectForBaseline(ObjectNode model, RevisionEntry revision) {
        ObjectNode project = JSON.createObjectNode();
        project.put("project_id", "source.baseline." + revision.modelId()); project.put("name", "Imported " + text(model, "name")); project.put("normalized_name", ("imported " + text(model, "name")).toLowerCase(java.util.Locale.ROOT)); project.putNull("description"); project.put("status", "ACTIVE");
        project.put("default_profile_id", revision.revision().profileBinding().profile().id()); project.put("default_profile_version", revision.revision().profileBinding().profile().version()); project.put("created_at", revision.createdAt()); project.put("updated_at", revision.createdAt());
        return project;
    }

    private ExchangePackageManifest.Entry only(Map<String, ExchangePackageManifest.Entry> entries, String role) {
        List<ExchangePackageManifest.Entry> values = entries.values().stream().filter(entry -> role.equals(entry.entryRole())).toList();
        if (values.size() != 1) throw layout(role + " must occur exactly once.");
        return values.getFirst();
    }

    private ExchangePackageManifest.Entry find(Map<String, ExchangePackageManifest.Entry> entries, String role, String path) {
        return entries.values().stream().filter(entry -> role.equals(entry.entryRole()) && path.equals(entry.logicalPath())).findFirst().orElse(null);
    }

    private void requireNoOtherRoles(Map<String, ExchangePackageManifest.Entry> entries, String... roles) {
        java.util.Set<String> allowed = java.util.Set.of(roles);
        if (entries.values().stream().anyMatch(entry -> !allowed.contains(entry.entryRole()))) throw layout("Package contains an unsupported import entry role.");
    }

    private void requirePath(ExchangePackageManifest.Entry entry, String path) { if (!path.equals(entry.logicalPath()) || !entry.required() || !"application/json".equals(entry.mediaType())) throw layout("Entry path or media type is invalid: " + entry.entryId()); }
    private ObjectNode object(byte[] raw, String owner) throws Exception { JsonNode node = JSON.readTree(raw); if (node == null || !node.isObject()) throw layout(owner + " must be an object."); return (ObjectNode) node; }
    private void exact(ObjectNode node, String... fields) { java.util.Set<String> actual = new java.util.HashSet<>(); node.fieldNames().forEachRemaining(actual::add); if (actual.size() != fields.length || !actual.containsAll(java.util.Set.of(fields))) throw layout("Entry has unknown or missing fields."); }
    private String text(ObjectNode node, String field) { JsonNode value = node.get(field); if (value == null || !value.isTextual() || value.asText().isBlank()) throw layout(field + " must be non-blank text."); return value.asText(); }
    private String nullableText(ObjectNode node, String field) { JsonNode value = node.get(field); if (value == null || value.isNull()) return null; if (!value.isTextual() || value.asText().isBlank()) throw layout(field + " must be text or null."); return value.asText(); }
    private int positive(ObjectNode node, String field) { JsonNode value = node.get(field); if (value == null || !value.canConvertToInt() || value.intValue() < 1) throw layout(field + " must be a positive integer."); return value.intValue(); }
    private String canonical(JsonNode value) { if (value == null) throw layout("Required JSON value is absent."); return Rfc8785JsonCanonicalizer.canonicalize(value); }
    private void nullable(PreparedStatement statement, int index, JsonNode value) throws Exception { if (value == null || value.isNull()) statement.setNull(index, java.sql.Types.VARCHAR); else if (value.isTextual()) statement.setString(index, value.asText()); else throw layout("Description must be text or null."); }
    private Connection connect(Path database) throws Exception { Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath() + "?foreign_keys=on"); connection.createStatement().execute("PRAGMA foreign_keys=ON"); return connection; }
    private String sha256(byte[] raw) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); } catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); } }
    private void requireRegularDirectoryOrAbsent(Path path, String owner) { if (Files.exists(path, LinkOption.NOFOLLOW_LINKS) && (!Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(path))) throw failure("EXCHANGE_PERSISTENCE_FAILED", owner + " must be a regular directory."); }
    private void force(Path path) throws IOException { try (FileChannel channel = FileChannel.open(path, StandardOpenOption.WRITE)) { channel.force(true); } }
    private void forceDirectoryWhenSupported(Path directory) throws IOException { try (FileChannel channel = FileChannel.open(directory, StandardOpenOption.READ)) { channel.force(true); } catch (java.nio.file.FileSystemException exception) { if (!exception.getMessage().contains("Is a directory")) throw exception; } }
    private void deleteIfEmpty(Path directory) throws IOException { if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(directory)) return; try (var children = Files.list(directory)) { if (children.findAny().isEmpty()) Files.delete(directory); } }
    private void cleanup(Path root) { if (root == null || !root.startsWith(storageRoot.resolve(".exchange-staging")) || !Files.exists(root, LinkOption.NOFOLLOW_LINKS)) return; try (var paths = Files.walk(root)) { for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path); } catch (IOException ignored) { } }
    private ExchangeException layout(String message) { return failure("EXCHANGE_IMPORT_LAYOUT_INVALID", message); }
    private ExchangeException semantic(String message) { return failure("EXCHANGE_SEMANTIC_REVISION_INVALID", message); }
    private ExchangeException failure(String code, String message) { return new ExchangeException(code, message); }
    private ExchangeException failure(String code, String message, Throwable cause) { return new ExchangeException(code, message, cause); }

    private record ImportPackage(ExchangePackageManifest manifest, ObjectNode project, Map<String, ModelEntry> models, List<RevisionEntry> revisions, Map<String, HeadEntry> heads, List<BaselineEntry> baselines) { }
    private record ModelEntry(String id, ObjectNode catalog) { }
    private record RevisionEntry(String id, String modelId, byte[] raw, ObjectNode document, SemanticRevision revision, String parentRevisionId, String createdAt) { }
    private record HeadEntry(String modelId, String revisionId, int sequence, String updatedAt) { }
    private record BaselineEntry(String id, String modelId, String revisionId, ObjectNode node) { }
}
