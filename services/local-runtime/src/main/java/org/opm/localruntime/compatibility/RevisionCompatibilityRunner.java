package org.opm.localruntime.compatibility;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CandidateRevisionCommitter;
import org.opm.localruntime.command.CommitResult;
import org.opm.localruntime.command.ProfileRuleBinding;
import org.opm.localruntime.command.RevisionCommitBundle;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.opm.localruntime.golden.OplGoldenReplayDatabaseInitializer;
import org.opm.localruntime.semantic.HistoricalRevisionReplayException;
import org.opm.localruntime.semantic.HistoricalRevisionReplayService;
import org.opm.localruntime.semantic.RevisionDocumentEnvelope;
import org.opm.localruntime.semantic.RevisionDocumentReaderRouter;
import org.opm.localruntime.semantic.SemanticReadException;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.storage.SqliteRevisionCommitRepository;
import org.opm.localruntime.text.OplGrammar;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplGenerationException;
import org.opm.localruntime.text.OplGenerationCode;
import org.opm.localruntime.text.OplParagraph;
import org.opm.localruntime.text.OplSentence;
import org.opm.localruntime.text.OplTextArtifact;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.OplToken;
import org.opm.localruntime.text.TextGenerationAssets;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 执行两次隔离 Compatibility attempt；未实现的模式必须显式失败。 */
public final class RevisionCompatibilityRunner {

    private final ObjectMapper mapper = new ObjectMapper();
    private final RevisionDocumentReaderRouter reader = new RevisionDocumentReaderRouter();
    private final OplGoldenReplayDatabaseInitializer databaseInitializer = new OplGoldenReplayDatabaseInitializer();

    public RevisionCompatibilityReportWriter.Report run(Path manifestPath, Path workRoot) {
        try {
            byte[] manifestBytes = Files.readAllBytes(manifestPath);
            JsonNode manifest = mapper.readTree(manifestBytes);
            List<RevisionCompatibilityReportWriter.CaseResult> cases = new ArrayList<>();
            for (JsonNode item : manifest.required("cases")) cases.add(runCase(manifestPath.getParent(), item, workRoot));
            JsonNode historical = manifest.required("cases").get(0).required("source_binding");
            JsonNode active = manifest.required("cases").get(5).required("source_binding");
            return new RevisionCompatibilityReportWriter.Report(manifest.required("manifest_id").asText(), manifest.required("manifest_version").asText(), sha256(manifestBytes),
                    manifest.required("cases").get(0).required("source_schema_ref"), manifest.required("cases").get(5).required("source_schema_ref"), historical, active, cases);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot execute revision compatibility replay", exception);
        }
    }

    private RevisionCompatibilityReportWriter.CaseResult runCase(Path manifestRoot, JsonNode item, Path workRoot) {
        List<RevisionCompatibilityReportWriter.Attempt> attempts = List.of(
                attempt(manifestRoot, item, workRoot.resolve(item.required("case_id").asText()).resolve("1"), 1),
                attempt(manifestRoot, item, workRoot.resolve(item.required("case_id").asText()).resolve("2"), 2));
        RevisionCompatibilityReportWriter.Status expected = "PASS".equals(item.required("expectation").asText())
                ? RevisionCompatibilityReportWriter.Status.PASS_MATCHED : RevisionCompatibilityReportWriter.Status.BLOCKED_MATCHED;
        boolean deterministic = attempts.getFirst().status() == attempts.get(1).status()
                && same(attempts.getFirst().outputSha256(), attempts.get(1).outputSha256()) && same(attempts.getFirst().availability(), attempts.get(1).availability())
                && same(attempts.getFirst().errorCode(), attempts.get(1).errorCode()) && same(attempts.getFirst().detailCode(), attempts.get(1).detailCode())
                && attempts.getFirst().transaction().equals(attempts.get(1).transaction())
                && same(attempts.getFirst().headBefore(), attempts.get(1).headBefore()) && same(attempts.getFirst().headAfter(), attempts.get(1).headAfter());
        RevisionCompatibilityReportWriter.Status result = deterministic && attempts.stream().allMatch(value -> value.status() == expected
                && matchesTransaction(item.required("expected_transaction"), value.transaction()))
                ? expected : RevisionCompatibilityReportWriter.Status.FAILED;
        return new RevisionCompatibilityReportWriter.CaseResult(item.required("case_id").asText(), item.required("expectation").asText(), result, attempts);
    }

    private RevisionCompatibilityReportWriter.Attempt attempt(Path manifestRoot, JsonNode item, Path attemptRoot, int ordinal) {
        try {
            Files.createDirectories(attemptRoot);
            byte[] input = Files.readAllBytes(manifestRoot.resolve(item.required("input_ref").asText()).normalize());
            String inputSha = sha256(input);
            if (!inputSha.equals(item.required("input_sha256").asText())) return failed(ordinal, inputSha, "INPUT_SHA_MISMATCH", "INPUT_SHA_MISMATCH");
            String caseId = item.required("case_id").asText();
            if (caseId.equals("COMPAT-003.V01_EXACT_DIGEST_REPLAY.PASS")) {
                HistoricalRevisionReplayService.HistoricalRevisionReplayResult replay = historical(input, false);
                return matched(ordinal, inputSha, replay.textSha256(), replay.textEvidenceAvailability().name());
            }
            if (caseId.equals("COMPAT-004.V01_SQLITE_REOPEN.PASS")) {
                Path fixture = attemptRoot.resolve("historical-revision.json");
                Files.write(fixture, input);
                RevisionDocumentEnvelope document = reader.read(input);
                Path database = databaseInitializer.initialize(attemptRoot.resolve("sqlite"), document.revision(), fixture);
                RevisionCommitRepository.Head head = new SqliteRevisionCommitRepository(database).currentHead(document.revision().modelId()).orElseThrow();
                if (!head.revisionId().equals(document.revision().revisionId()) || head.revisionSequence() != document.revision().revisionSequence()
                        || !sha256(storedRevision(database, document.revision().revisionId())).equals(inputSha)) {
                    return failed(ordinal, inputSha, "PERSISTENCE_FAILED", "HISTORICAL_SQLITE_REOPEN_MISMATCH");
                }
                return matched(ordinal, inputSha, inputSha, document.textEvidenceAvailability().name());
            }
            if (caseId.equals("COMPAT-005.V01_TO_V02_SAME_BINDING.PASS")) {
                Path fixture = attemptRoot.resolve("base-v01-active-binding.json");
                Files.write(fixture, input);
                RevisionDocumentEnvelope document = reader.read(input);
                SemanticRevision base = document.revision();
                SemanticRevision candidate = layoutCandidate(base, "revision.compatibility.005.0002");
                Path database = databaseInitializer.initialize(attemptRoot.resolve("sqlite"), base, fixture);
                Snapshot before = snapshot(database, base.modelId());
                ProfileRuleBinding expected = new ProfileRuleBinding(base.profileBinding().profile().id(), base.profileBinding().profile().version(),
                        base.profileBinding().ruleSet().id(), base.profileBinding().ruleSet().version());
                OplGrammar grammar = new OplGrammar(new OplGrammar.Binding(base.profileBinding().textGrammar().id(), base.profileBinding().textGrammar().version(), base.profileBinding().textGrammar().sha256()), List.of());
                CommitResult result = new CandidateRevisionCommitter(new SqliteRevisionCommitRepository(database),
                        new ProfilePackageAssembler(new FileProfilePackageLoader(repositoryRoot().resolve("packages/profiles"))))
                        .commit(new CandidateRevisionCommand(OplGoldenReplayDatabaseInitializer.PROJECT_ID, base.modelId(), "command.compat.005." + ordinal, base.revisionId(), base, candidate,
                                expected, grammar, inputSha, "COMPATIBILITY", Instant.EPOCH));
                if (!(result instanceof CommitResult.Committed committed)) {
                    if (result instanceof CommitResult.Rejected rejected) return failed(ordinal, inputSha, rejected.code().name(), rejected.message());
                    return failed(ordinal, inputSha, "COMMIT_REJECTED", "V01_TO_V02_COMMIT_FAILED");
                }
                byte[] output = storedRevision(database, committed.committedRevisionId());
                RevisionDocumentEnvelope outputDocument = reader.read(output);
                Snapshot after = snapshot(database, base.modelId());
                if (!"0.2".equals(outputDocument.schemaVersion()) || !outputDocument.revision().profileBinding().equals(candidate.profileBinding())) {
                    return failed(ordinal, inputSha, "PERSISTENCE_FAILED", "V01_TO_V02_ROUNDTRIP_MISMATCH");
                }
                return matched(ordinal, inputSha, sha256(output), outputDocument.textEvidenceAvailability().name(), after.delta(before), before.headRevisionId(), after.headRevisionId());
            }
            if (caseId.equals("COMPAT-006.V02_ROUNDTRIP_REPLAY.PASS")) {
                Path fixture = attemptRoot.resolve("base-v02-roundtrip.json");
                Files.write(fixture, input);
                RevisionDocumentEnvelope document = reader.read(input);
                SemanticRevision base = document.revision();
                SemanticRevision candidate = layoutCandidate(base, "revision.compatibility.006.0002");
                Path database = databaseInitializer.initialize(attemptRoot.resolve("sqlite"), base, fixture);
                Snapshot before = snapshot(database, base.modelId());
                ProfilePackageAssembler assembler = new ProfilePackageAssembler(new FileProfilePackageLoader(repositoryRoot().resolve("packages/profiles")));
                TextGenerationAssets assets = assembler.assemble(candidate.profileBinding());
                ProfileRuleBinding expected = new ProfileRuleBinding(base.profileBinding().profile().id(), base.profileBinding().profile().version(),
                        base.profileBinding().ruleSet().id(), base.profileBinding().ruleSet().version());
                CommitResult result = new CandidateRevisionCommitter(new SqliteRevisionCommitRepository(database), assembler)
                        .commit(new CandidateRevisionCommand(OplGoldenReplayDatabaseInitializer.PROJECT_ID, base.modelId(), "command.compat.006." + ordinal,
                                base.revisionId(), base, candidate, expected, assets.grammar(), inputSha, "COMPATIBILITY", Instant.EPOCH));
                if (!(result instanceof CommitResult.Committed committed)) {
                    if (result instanceof CommitResult.Rejected rejected) return failed(ordinal, inputSha, rejected.code().name(), rejected.message());
                    return failed(ordinal, inputSha, "COMMIT_REJECTED", "V02_ROUNDTRIP_COMMIT_FAILED");
                }
                byte[] output = storedRevision(database, committed.committedRevisionId());
                RevisionDocumentEnvelope outputDocument = reader.read(output);
                Snapshot after = snapshot(database, base.modelId());
                JsonNode outputRoot = mapper.readTree(output);
                OplGenerationResult replay = new OplTextGenerationService().generate(outputDocument.revision(), outputDocument.revision().rootContextId(), assets);
                int storedSentenceCount = outputRoot.required("text_artifact").required("sentences").size();
                if (!outputDocument.revision().equals(candidate)
                        || !replay.artifact().artifactDigest().equals(outputRoot.required("text_artifact").required("artifact_digest").required("digest").asText())
                        || replay.artifact().paragraphs().stream().mapToInt(value -> value.sentences().size()).sum() != storedSentenceCount
                        || replay.traces().size() != outputRoot.required("text_traces").size()) {
                    return failed(ordinal, inputSha, "PERSISTENCE_FAILED", "V02_ROUNDTRIP_REPLAY_MISMATCH");
                }
                return matched(ordinal, inputSha, sha256(output), outputDocument.textEvidenceAvailability().name(), after.delta(before), before.headRevisionId(), after.headRevisionId());
            }
            if (caseId.equals("COMPAT-013.V02_LEGACY_VALUE_WRITE.BLOCKED")) {
                RevisionDocumentEnvelope document = reader.read(input);
                SemanticRevision candidate = layoutCandidate(document.revision(), "revision.compatibility.013.0002");
                TextGenerationAssets assets = new ProfilePackageAssembler(new FileProfilePackageLoader(repositoryRoot().resolve("packages/profiles")))
                        .assemble(candidate.profileBinding());
                OplTextGenerationService generator = new OplTextGenerationService();
                OplGenerationResult generated = generator.generate(candidate, candidate.rootContextId(), assets);
                boolean tokenRejected = rejectsLegacyEvidence(generator, candidate, assets, legacyTokenEvidence(generated));
                boolean sourceRejected = rejectsLegacyEvidence(generator, candidate, assets, legacySourceEvidence(generated));
                return tokenRejected && sourceRejected
                        ? blocked(ordinal, inputSha, item.required("expected_error_code").asText(), item.required("expected_detail_code").asText())
                        : failed(ordinal, inputSha, "TEXT_GENERATION_BLOCKED", "TEXT_LEGACY_VALUE_WRITE_ACCEPTED");
            }
            if (caseId.equals("COMPAT-009.V01_ASSET_MISSING.BLOCKED")) {
                try { historical(input, false, attemptRoot.resolve("missing-assets")); return failed(ordinal, inputSha, "PROFILE_ASSET_MISSING", "HISTORICAL_ASSET_UNEXPECTED"); }
                catch (HistoricalRevisionReplayException exception) { return blocked(ordinal, inputSha, "PROFILE_ASSET_MISSING", exception.code().name()); }
            }
            if (caseId.equals("COMPAT-010.V01_ASSET_DIGEST_MISMATCH.BLOCKED")) {
                Path assets = copyHistoricalProfile(attemptRoot.resolve("mutated-assets"));
                Files.writeString(assets.resolve("profile.iso19450.2024.draft/0.1.0/grammar/representative-opl-grammar.json"), "\n", StandardOpenOption.APPEND);
                try { historical(input, false, assets); return failed(ordinal, inputSha, "PACKAGE_INTEGRITY_FAILED", "HISTORICAL_ASSET_UNEXPECTED"); }
                catch (HistoricalRevisionReplayException exception) { return blocked(ordinal, inputSha, "PACKAGE_INTEGRITY_FAILED", exception.code().name()); }
            }
            if (caseId.equals("COMPAT-011.V01_RENDERER_MISSING.BLOCKED")) {
                try { historical(input, true, repositoryRoot().resolve("packages/profiles")); return failed(ordinal, inputSha, "TEXT_GENERATION_BLOCKED", "HISTORICAL_RENDERER_UNEXPECTED"); }
                catch (HistoricalRevisionReplayException exception) { return blocked(ordinal, inputSha, "TEXT_GENERATION_BLOCKED", exception.code().name()); }
            }
            if (caseId.equals("COMPAT-012.PROFILE_REBIND_WITHOUT_MIGRATION.BLOCKED")) {
                RevisionDocumentEnvelope document = reader.read(input);
                SemanticRevision base = document.revision();
                SemanticRevision candidate = rebindingCandidate(base, item.required("target_binding"));
                GuardRepository repository = new GuardRepository(base);
                ProfileRuleBinding expected = new ProfileRuleBinding(candidate.profileBinding().profile().id(), candidate.profileBinding().profile().version(),
                        candidate.profileBinding().ruleSet().id(), candidate.profileBinding().ruleSet().version());
                OplGrammar grammar = new OplGrammar(new OplGrammar.Binding(candidate.profileBinding().textGrammar().id(), candidate.profileBinding().textGrammar().version(), candidate.profileBinding().textGrammar().sha256()), List.of());
                CommitResult result = new CandidateRevisionCommitter(repository).commit(new CandidateRevisionCommand("project.compatibility", base.modelId(), "command.compat.012." + ordinal,
                        base.revisionId(), base, candidate, expected, grammar, inputSha, "COMPATIBILITY", Instant.EPOCH));
                if (result instanceof CommitResult.Rejected rejected && rejected.code().name().equals(item.required("expected_error_code").asText())
                        && rejected.message().equals(item.required("expected_detail_code").asText()) && repository.commitCalls == 0) {
                    return blocked(ordinal, inputSha, rejected.code().name(), rejected.message());
                }
                return failed(ordinal, inputSha, "RULE_VERSION_CONFLICT", "PROFILE_MIGRATION_GUARD_MISMATCH");
            }
            RevisionDocumentEnvelope document = reader.read(input);
            if (caseId.equals("COMPAT-001.V01_SEMANTIC_ONLY_READ.PASS") || caseId.equals("COMPAT-002.V01_STORED_TEXT_READ.PASS")) {
                return matched(ordinal, inputSha, inputSha, document.textEvidenceAvailability().name());
            }
            return failed(ordinal, inputSha, "UNIMPLEMENTED_MODE", item.required("mode").asText());
        } catch (SemanticReadException exception) {
            if (item.required("expectation").asText().equals("BLOCKED")
                    && item.required("expected_detail_code").asText().equals(exception.getMessage())) return blocked(ordinal, inputSha(item, manifestRoot),
                    item.required("expected_error_code").asText(), exception.getMessage());
            return failed(ordinal, inputSha(item, manifestRoot), "PERSISTENCE_FAILED", exception.getMessage());
        } catch (Exception exception) {
            return failed(ordinal, inputSha(item, manifestRoot), "REPLAY_INTERNAL_ERROR", exception.getClass().getSimpleName());
        }
    }

    private HistoricalRevisionReplayService.HistoricalRevisionReplayResult historical(byte[] input, boolean noRenderer) {
        return historical(input, noRenderer, repositoryRoot().resolve("packages/profiles"));
    }

    private HistoricalRevisionReplayService.HistoricalRevisionReplayResult historical(byte[] input, boolean noRenderer, Path root) {
        HistoricalRevisionReplayService service = noRenderer
                ? new HistoricalRevisionReplayService(new FileProfilePackageLoader(root), List.of())
                : new HistoricalRevisionReplayService(new FileProfilePackageLoader(root));
        return service.replay(reader.read(input));
    }

    private Path copyHistoricalProfile(Path targetRoot) throws Exception {
        Path source = repositoryRoot().resolve("packages/profiles/profile.iso19450.2024.draft/0.1.0");
        Path target = targetRoot.resolve("profile.iso19450.2024.draft/0.1.0");
        try (var files = Files.walk(source)) {
            for (Path path : files.toList()) {
                Path destination = target.resolve(source.relativize(path));
                if (Files.isDirectory(path)) Files.createDirectories(destination);
                else Files.copy(path, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return targetRoot;
    }

    private byte[] storedRevision(Path database, String revisionId) throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath());
             var statement = connection.prepareStatement("SELECT document_json FROM revision_document WHERE revision_id = ?")) {
            statement.setString(1, revisionId);
            try (var result = statement.executeQuery()) {
                if (!result.next()) throw new IllegalStateException("Historical revision is missing after SQLite reopen");
                return result.getString(1).getBytes(java.nio.charset.StandardCharsets.UTF_8);
            }
        }
    }

    private SemanticRevision rebindingCandidate(SemanticRevision base, JsonNode binding) {
        SemanticRevision.ProfileBinding target = new SemanticRevision.ProfileBinding(asset(binding.required("profile")), asset(binding.required("rule_set")),
                asset(binding.required("text_grammar")), asset(binding.required("symbol_catalog")), asset(binding.required("normalization_adapter")), binding.required("binding_digest").asText());
        return new SemanticRevision("revision.compatibility.012.0002", base.modelId(), base.revisionSequence() + 1, target, base.rootContextId(), base.elements(), base.features(), base.states(), base.facts(), base.contexts(), base.occurrences(), base.layouts(), base.statePresentations());
    }

    private SemanticRevision layoutCandidate(SemanticRevision base, String revisionId) {
        List<SemanticRevision.Layout> layouts = new ArrayList<>(base.layouts());
        SemanticRevision.Layout first = layouts.getFirst();
        layouts.set(0, new SemanticRevision.Layout(first.id(), first.x() + 1, first.y(), first.width(), first.height(), first.zOrder()));
        return new SemanticRevision(revisionId, base.modelId(), base.revisionSequence() + 1, base.profileBinding(), base.rootContextId(),
                base.elements(), base.features(), base.states(), base.facts(), base.contexts(), base.occurrences(), layouts, base.statePresentations());
    }

    private SemanticRevision.AssetReference asset(JsonNode value) {
        return new SemanticRevision.AssetReference(value.required("id").asText(), value.required("version").asText(), value.required("sha256").asText());
    }

    private boolean rejectsLegacyEvidence(
            OplTextGenerationService generator,
            SemanticRevision revision,
            TextGenerationAssets assets,
            OplGenerationResult evidence) {
        try {
            generator.validateActiveWriteEvidence(revision, assets, evidence);
            return false;
        } catch (OplGenerationException exception) {
            return exception.code() == OplGenerationCode.TEXT_LEGACY_VALUE_FORBIDDEN;
        }
    }

    private OplGenerationResult legacyTokenEvidence(OplGenerationResult source) {
        return rewriteFirstToken(source, original -> new OplToken(original.tokenId(), original.sentenceId(), original.ordinal(), original.text(),
                OplToken.Kind.PROCESS, original.startUtf8Byte(), original.endUtf8Byte(), original.sourceRefs()));
    }

    private OplGenerationResult legacySourceEvidence(OplGenerationResult source) {
        return rewriteFirstToken(source, original -> {
            List<OplToken.SourceRef> refs = new ArrayList<>(original.sourceRefs());
            refs.add(new OplToken.SourceRef(OplToken.SourceKind.LEGACY, "legacy.compatibility", "legacy", null, "SINGLE"));
            return new OplToken(original.tokenId(), original.sentenceId(), original.ordinal(), original.text(), original.kind(),
                    original.startUtf8Byte(), original.endUtf8Byte(), refs);
        });
    }

    private OplGenerationResult rewriteFirstToken(OplGenerationResult source, java.util.function.UnaryOperator<OplToken> replacement) {
        OplTextArtifact artifact = source.artifact();
        List<OplParagraph> paragraphs = new ArrayList<>(artifact.paragraphs());
        OplParagraph firstParagraph = paragraphs.getFirst();
        List<OplSentence> sentences = new ArrayList<>(firstParagraph.sentences());
        OplSentence firstSentence = sentences.getFirst();
        List<OplToken> tokens = new ArrayList<>(firstSentence.tokens());
        tokens.set(0, replacement.apply(tokens.getFirst()));
        sentences.set(0, new OplSentence(firstSentence.sentenceId(), firstSentence.text(), firstSentence.ordinal(), tokens,
                firstSentence.generationRuleIds(), firstSentence.inputFactIds()));
        paragraphs.set(0, new OplParagraph(firstParagraph.paragraphId(), firstParagraph.contextId(), firstParagraph.ordinal(), sentences));
        return new OplGenerationResult(new OplTextArtifact(artifact.artifactId(), artifact.inputRevisionId(), artifact.grammarBinding(),
                artifact.contextId(), paragraphs, artifact.artifactDigest()), source.traces());
    }

    private static final class GuardRepository implements RevisionCommitRepository {
        private final SemanticRevision base;
        private int commitCalls;
        private GuardRepository(SemanticRevision base) { this.base = base; }
        @Override public Optional<Head> currentHead(String modelId) { return Optional.of(new Head(base.revisionId(), base.revisionSequence(), true)); }
        @Override public Optional<Receipt> receipt(String operationId, String aggregateId, String commandId) { return Optional.empty(); }
        @Override public CommitResult.Committed commit(RevisionCommitBundle bundle) { commitCalls++; throw new AssertionError("Profile migration guard must reject before commit"); }
    }

    private RevisionCompatibilityReportWriter.Attempt matched(int ordinal, String input, String output, String availability) {
        return matched(ordinal, input, output, availability, zeroTransaction(), null, null);
    }
    private RevisionCompatibilityReportWriter.Attempt blocked(int ordinal, String input, String code, String detail) {
        return new RevisionCompatibilityReportWriter.Attempt(ordinal, RevisionCompatibilityReportWriter.Status.BLOCKED_MATCHED, input, null, null, code, detail, zeroTransaction(), null, null);
    }
    private RevisionCompatibilityReportWriter.Attempt failed(int ordinal, String input, String code, String detail) {
        return new RevisionCompatibilityReportWriter.Attempt(ordinal, RevisionCompatibilityReportWriter.Status.FAILED, input, null, null, code, detail, zeroTransaction(), null, null);
    }
    private RevisionCompatibilityReportWriter.Attempt matched(int ordinal, String input, String output, String availability,
                                                               RevisionCompatibilityReportWriter.Transaction transaction, String headBefore, String headAfter) {
        return new RevisionCompatibilityReportWriter.Attempt(ordinal, RevisionCompatibilityReportWriter.Status.PASS_MATCHED, input, output, availability, null, null, transaction, headBefore, headAfter);
    }
    private boolean matchesTransaction(JsonNode expected, RevisionCompatibilityReportWriter.Transaction actual) {
        return expected.required("revision_delta").asInt() == actual.revisionDelta()
                && expected.required("revision_parent_delta").asInt() == actual.revisionParentDelta()
                && expected.required("text_artifact_delta").asInt() == actual.textArtifactDelta()
                && expected.required("text_trace_delta").asInt() == actual.textTraceDelta()
                && expected.required("finding_delta").asInt() == actual.findingDelta()
                && expected.required("operation_delta").asInt() == actual.operationDelta()
                && expected.required("receipt_delta").asInt() == actual.receiptDelta()
                && expected.required("draft_head_changed").asBoolean() == actual.draftHeadChanged();
    }
    private RevisionCompatibilityReportWriter.Transaction zeroTransaction() {
        return new RevisionCompatibilityReportWriter.Transaction(0, 0, 0, 0, 0, 0, 0, false);
    }
    private Snapshot snapshot(Path database, String modelId) throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath())) {
            return new Snapshot(count(connection, "revision_document"), count(connection, "revision_parent"), count(connection, "text_trace_index"),
                    count(connection, "finding_index"), count(connection, "operation_record"), count(connection, "idempotency_record"),
                    text(connection, "SELECT draft_head_revision_id FROM model_head WHERE model_id = ?", modelId),
                    integer(connection, "SELECT head_sequence FROM model_head WHERE model_id = ?", modelId));
        }
    }
    private int count(java.sql.Connection connection, String table) throws Exception { return integer(connection, "SELECT COUNT(*) FROM " + table); }
    private int integer(java.sql.Connection connection, String query) throws Exception { try (var statement = connection.createStatement(); var result = statement.executeQuery(query)) { result.next(); return result.getInt(1); } }
    private int integer(java.sql.Connection connection, String query, String value) throws Exception { try (var statement = connection.prepareStatement(query)) { statement.setString(1, value); try (var result = statement.executeQuery()) { result.next(); return result.getInt(1); } } }
    private String text(java.sql.Connection connection, String query, String value) throws Exception { try (var statement = connection.prepareStatement(query)) { statement.setString(1, value); try (var result = statement.executeQuery()) { result.next(); return result.getString(1); } } }
    private record Snapshot(int revisions, int parents, int traces, int findings, int operations, int receipts, String headRevisionId, int headSequence) {
        RevisionCompatibilityReportWriter.Transaction delta(Snapshot before) {
            return new RevisionCompatibilityReportWriter.Transaction(revisions - before.revisions, parents - before.parents,
                    revisions - before.revisions, traces - before.traces, findings - before.findings, operations - before.operations,
                    receipts - before.receipts, !headRevisionId.equals(before.headRevisionId) || headSequence != before.headSequence);
        }
    }
    private String inputSha(JsonNode item, Path root) { try { return sha256(Files.readAllBytes(root.resolve(item.required("input_ref").asText()))); } catch (Exception ignored) { return item.required("input_sha256").asText(); } }
    private Path repositoryRoot() { Path current = Path.of("").toAbsolutePath(); while (current != null) { if (Files.isDirectory(current.resolve("packages"))) return current; current = current.getParent(); } throw new IllegalStateException("Cannot locate repository root"); }
    private boolean same(Object left, Object right) { return left == null ? right == null : left.equals(right); }
    private String sha256(byte[] bytes) { try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
}
