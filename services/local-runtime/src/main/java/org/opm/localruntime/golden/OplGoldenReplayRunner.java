package org.opm.localruntime.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.OplSymbolCatalogAssetLoader;
import org.opm.localruntime.assets.ProfileBindingSummary;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CandidateRevisionCommitter;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitResult;
import org.opm.localruntime.command.ProfileRuleBinding;
import org.opm.localruntime.command.RevisionCommitBundle;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.storage.SqliteRevisionCommitRepository;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplGenerationException;
import org.opm.localruntime.text.OplGrammar;
import org.opm.localruntime.text.OplSentence;
import org.opm.localruntime.text.OplTextTrace;
import org.opm.localruntime.text.OplToken;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.TextGenerationAssets;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

/** 执行版本化 Golden manifest 的两次隔离重放。 */
public final class OplGoldenReplayRunner {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SemanticRevisionReader revisionReader = new SemanticRevisionReader();
    private final OplTextGenerationService generationService = new OplTextGenerationService();
    private final OplGoldenArtifactCanonicalWriter artifactWriter = new OplGoldenArtifactCanonicalWriter();
    private final OplGoldenReplayDatabaseInitializer databaseInitializer = new OplGoldenReplayDatabaseInitializer();

    public OplGoldenReplayReportWriter.Report run(Path manifestPath, Path workRoot) {
        try {
            byte[] manifestBytes = Files.readAllBytes(manifestPath);
            JsonNode manifest = objectMapper.readTree(manifestBytes);
            Path profileRoot = manifestPath.toAbsolutePath().normalize().getParent().getParent();
            List<OplGoldenReplayReportWriter.CaseResult> cases = new ArrayList<>();
            for (JsonNode goldenCase : manifest.required("cases")) cases.add(runCase(profileRoot, goldenCase, workRoot));
            List<OplGoldenReplayReportWriter.AtomicCaseResult> atomicCases = new ArrayList<>();
            for (JsonNode atomicCase : manifest.required("atomic_cases")) atomicCases.add(runAtomicCase(profileRoot, atomicCase, workRoot.resolve("atomic")));
            return new OplGoldenReplayReportWriter.Report(manifest.required("manifest_id").asText(), manifest.required("manifest_version").asText(),
                    sha256(manifestBytes), "0.1.0", manifest.required("cases").get(0).required("binding_digest").asText(), cases, atomicCases);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot execute OPL Golden replay", exception);
        }
    }

    private OplGoldenReplayReportWriter.CaseResult runCase(Path profileRoot, JsonNode goldenCase, Path workRoot) {
        String caseId = goldenCase.required("case_id").asText();
        List<OplGoldenReplayReportWriter.Attempt> attempts = List.of(
                runAttempt(profileRoot, goldenCase, workRoot.resolve(caseId).resolve("1"), 1),
                runAttempt(profileRoot, goldenCase, workRoot.resolve(caseId).resolve("2"), 2));
        String expectation = goldenCase.required("expectation").asText();
        OplGoldenReplayReportWriter.ObservedStatus expectedStatus = "PASS".equals(expectation)
                ? OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED : OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED;
        boolean deterministic = attempts.getFirst().observedStatus() == attempts.get(1).observedStatus()
                && same(attempts.getFirst().artifactSha256(), attempts.get(1).artifactSha256())
                && same(attempts.getFirst().traceSha256(), attempts.get(1).traceSha256())
                && same(attempts.getFirst().errorCode(), attempts.get(1).errorCode())
                && attempts.getFirst().transaction().equals(attempts.get(1).transaction());
        if (!deterministic) {
            attempts = List.of(attempts.getFirst(), failed(2, attempts.get(1).stages(), "REPLAY_NONDETERMINISTIC", attempts.get(1).transaction()));
        }
        OplGoldenReplayReportWriter.ObservedStatus status = deterministic && attempts.stream().allMatch(item -> item.observedStatus() == expectedStatus)
                ? expectedStatus : OplGoldenReplayReportWriter.ObservedStatus.FAILED;
        return new OplGoldenReplayReportWriter.CaseResult(caseId, expectation, status, attempts);
    }

    private OplGoldenReplayReportWriter.AtomicCaseResult runAtomicCase(Path profileRoot, JsonNode atomicCase, Path workRoot) {
        String caseId = atomicCase.required("case_id").asText();
        List<OplGoldenReplayReportWriter.AtomicAttempt> attempts = List.of(
                runAtomicAttempt(profileRoot, atomicCase, workRoot.resolve(caseId).resolve("1"), 1),
                runAtomicAttempt(profileRoot, atomicCase, workRoot.resolve(caseId).resolve("2"), 2));
        boolean deterministic = attempts.getFirst().observedStatus() == attempts.get(1).observedStatus()
                && attempts.getFirst().commitCode().equals(attempts.get(1).commitCode())
                && attempts.getFirst().detailCode().equals(attempts.get(1).detailCode())
                && attempts.getFirst().transaction().equals(attempts.get(1).transaction())
                && attempts.getFirst().actualMutation().equals(attempts.get(1).actualMutation());
        OplGoldenReplayReportWriter.ObservedStatus status = deterministic
                && attempts.stream().allMatch(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED)
                ? OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED : OplGoldenReplayReportWriter.ObservedStatus.FAILED;
        return new OplGoldenReplayReportWriter.AtomicCaseResult(caseId, atomicCase.required("category").asText(), status, attempts);
    }

    private OplGoldenReplayReportWriter.AtomicAttempt runAtomicAttempt(Path profileRoot, JsonNode atomicCase, Path workDirectory, int ordinal) {
        OplGoldenReplayReportWriter.ActualMutation mutation = new OplGoldenReplayReportWriter.ActualMutation(
                atomicCase.required("fault").required("mutation").asText(), "unavailable", "unavailable");
        Path database = null;
        String modelId = null;
        Snapshot before = null;
        try {
            AtomicInput input = prepareAtomicInput(profileRoot, atomicCase, workDirectory);
            mutation = input.mutation();
            SemanticRevision baselineCandidate = revisionReader.read(profileRoot.resolve(atomicCase.required("input_revision_fixture").asText()));
            OplGrammar compatibilityGrammar = new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot.getParent().getParent()))
                    .assemble(baselineCandidate.profileBinding()).grammar();
            SemanticRevision base = revisionReader.read(input.basePath());
            SemanticRevision candidate = revisionReader.read(input.candidatePath());
            modelId = candidate.modelId();
            database = databaseInitializer.initialize(workDirectory, base, input.basePath());
            before = snapshot(database, modelId);
            CountingCommitRepository repository = new CountingCommitRepository(new SqliteRevisionCommitRepository(database));
            CommitResult result = new CandidateRevisionCommitter(repository, new ProfilePackageAssembler(new FileProfilePackageLoader(input.profileRoot().getParent().getParent())))
                    .commit(command(atomicCase.required("case_id").asText(), base, candidate, compatibilityGrammar, Files.readAllBytes(input.candidatePath())));
            Snapshot after = snapshot(database, modelId);
            OplGoldenReplayReportWriter.Transaction transaction = after.delta(before);
            String detail = result instanceof CommitResult.Rejected rejected ? detailCode(rejected) : "COMMIT_UNEXPECTED";
            String commitCode = result instanceof CommitResult.Rejected rejected ? rejected.code().name() : "COMMITTED";
            boolean matched = result instanceof CommitResult.Rejected
                    && atomicCase.required("expected_commit_code").asText().equals(commitCode)
                    && atomicCase.required("expected_error_code").asText().equals(detail)
                    && repository.commitCalls() == 0
                    && matchesTransaction(atomicCase.required("expected_transaction"), transaction);
            return new OplGoldenReplayReportWriter.AtomicAttempt(ordinal,
                    matched ? OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED : OplGoldenReplayReportWriter.ObservedStatus.FAILED,
                    commitCode, detail, atomicCase.required("fault").required("stage").asText(), optionalText(atomicCase.required("fault"), "role"), mutation, transaction);
        } catch (Exception exception) {
            OplGoldenReplayReportWriter.Transaction transaction = transactionAfterFailure(database, modelId, before, zeroTransaction());
            return new OplGoldenReplayReportWriter.AtomicAttempt(ordinal, OplGoldenReplayReportWriter.ObservedStatus.FAILED,
                    "REPLAY_INTERNAL_ERROR", exception instanceof ReplayMismatch mismatch ? mismatch.code : "REPLAY_INTERNAL_ERROR",
                    atomicCase.required("fault").required("stage").asText(), optionalText(atomicCase.required("fault"), "role"), mutation, transaction);
        }
    }

    private AtomicInput prepareAtomicInput(Path profileRoot, JsonNode atomicCase, Path workDirectory) throws Exception {
        Files.createDirectories(workDirectory);
        Path isolatedProfileRoot = workDirectory.resolve("assets").resolve(profileRoot.getParent().getFileName()).resolve(profileRoot.getFileName());
        copyDirectory(profileRoot, isolatedProfileRoot);
        ObjectNode base = objectMapper.readTree(Files.readAllBytes(profileRoot.resolve(atomicCase.required("base_revision_fixture").asText()))).deepCopy();
        ObjectNode candidate = objectMapper.readTree(Files.readAllBytes(profileRoot.resolve(atomicCase.required("input_revision_fixture").asText()))).deepCopy();
        ObjectNode fault = (ObjectNode) atomicCase.required("fault");
        String stage = fault.required("stage").asText();
        String mutation = fault.required("mutation").asText();
        String role = optionalText(fault, "role");
        if ("PRODUCTION_IDENTITY".equals(stage)) {
            fact(candidate).with("source").put("source_entity_id", "opl.structural.exhibition.unknown");
        } else if ("PRODUCTION_PLAN".equals(stage)) {
            if ("EXHIBITION_RHS_MISSING".equals(mutation)) fact(candidate).withArray("endpoints").remove(2);
            else fact(candidate).put("collection_completeness", "INCOMPLETE");
        } else if ("ASSET_PRESENCE".equals(stage)) {
            Files.delete(isolatedAssetPath(isolatedProfileRoot, role));
        } else if ("ASSET_BYTES".equals(stage)) {
            Path asset = isolatedAssetPath(isolatedProfileRoot, role);
            byte[] bytes = Files.readAllBytes(asset);
            for (int index = bytes.length - 1; index >= 0; index--) {
                if (!Character.isWhitespace((char) bytes[index])) { bytes[index] = bytes[index] == '0' ? (byte) '1' : (byte) '0'; break; }
            }
            Files.write(asset, bytes);
        } else if ("ASSET_IDENTITY".equals(stage)) {
            ObjectNode asset = objectMapper.readTree(Files.readAllBytes(isolatedAssetPath(isolatedProfileRoot, role))).deepCopy();
            String field = "RULE_SET".equals(role) ? "rule_set_id" : "asset_id";
            asset.put(field, asset.required(field).asText() + ".mutated");
            Files.write(isolatedAssetPath(isolatedProfileRoot, role), objectMapper.writeValueAsBytes(asset));
            refreshProfileDigests(isolatedProfileRoot, base, candidate, true);
        } else if ("CAPABILITY_BINDING".equals(stage)) {
            ObjectNode asset = objectMapper.readTree(Files.readAllBytes(isolatedAssetPath(isolatedProfileRoot, role))).deepCopy();
            removeBoundAsset(asset, role);
            Files.write(isolatedAssetPath(isolatedProfileRoot, role), objectMapper.writeValueAsBytes(asset));
            refreshProfileDigests(isolatedProfileRoot, base, candidate, true);
        } else if ("REVISION_BINDING".equals(stage)) {
            flipDigest(base.with("profile_binding").with("symbol_catalog").with("digest"));
            flipDigest(candidate.with("profile_binding").with("symbol_catalog").with("digest"));
            refreshBindingDigest(base);
            refreshBindingDigest(candidate);
        } else if ("BINDING_DIGEST".equals(stage)) {
            flipDigest(base.with("profile_binding").with("binding_digest"));
            flipDigest(candidate.with("profile_binding").with("binding_digest"));
        } else {
            throw new IllegalArgumentException("Unsupported Atomic stage: " + stage);
        }
        Path basePath = workDirectory.resolve("base.json");
        Path candidatePath = workDirectory.resolve("candidate.json");
        Files.write(basePath, objectMapper.writeValueAsBytes(base));
        Files.write(candidatePath, objectMapper.writeValueAsBytes(candidate));
        ObjectNode binding = candidate.with("profile_binding");
        return new AtomicInput(isolatedProfileRoot, basePath, candidatePath,
                new OplGoldenReplayReportWriter.ActualMutation(mutation, binding.required("profile").required("digest").required("digest").asText(),
                        binding.required("binding_digest").required("digest").asText()));
    }

    private void refreshProfileDigests(Path profileRoot, ObjectNode base, ObjectNode candidate, boolean updateReferences) throws Exception {
        Path profilePath = profileRoot.resolve("profile.json");
        ObjectNode profile = objectMapper.readTree(Files.readAllBytes(profilePath)).deepCopy();
        ArrayNode entries = profile.with("manifest").withArray("entries");
        for (JsonNode item : entries) {
            ObjectNode entry = (ObjectNode) item;
            String role = entry.required("role").asText();
            Path asset = profileRoot.resolve(entry.required("logical_path").asText());
            byte[] bytes = Files.readAllBytes(asset);
            entry.put("byte_length", bytes.length);
            entry.with("digest").put("digest", sha256(bytes));
            if (updateReferences) updateProfileReference(profile, role, entry.required("digest").required("digest").asText());
        }
        String packageDigest = packageDigest(entries);
        profile.with("manifest").with("package_digest").put("digest", packageDigest);
        Files.write(profilePath, objectMapper.writeValueAsBytes(profile));
        updateRevisionBinding(base, profile, packageDigest);
        updateRevisionBinding(candidate, profile, packageDigest);
    }

    private void updateProfileReference(ObjectNode profile, String role, String digest) {
        dependency(profile, role).with("asset").with("digest").put("digest", digest);
        ObjectNode reference = switch (role) {
            case "RULE_SET" -> dependency(profile, role).with("asset");
            case "SYMBOL_ASSET" -> profile.with("symbol_catalog_ref");
            case "GRAMMAR_ASSET" -> profile.with("text_grammar_ref");
            case "NORMALIZATION_DATA" -> profile.with("normalization_adapter_ref");
            default -> throw new IllegalArgumentException("Unsupported profile role: " + role);
        };
        reference.with("digest").put("digest", digest);
    }

    private ObjectNode dependency(ObjectNode profile, String role) {
        for (JsonNode item : profile.withArray("dependencies")) if (role.equals(item.required("role").asText())) return (ObjectNode) item;
        throw new IllegalArgumentException("Profile dependency is missing: " + role);
    }

    private void updateRevisionBinding(ObjectNode revision, ObjectNode profile, String packageDigest) {
        ObjectNode binding = revision.with("profile_binding");
        binding.with("profile").with("digest").put("digest", packageDigest);
        copyReference(profile, dependency(profile, "RULE_SET").with("asset"), binding.with("rule_set"));
        copyReference(profile, profile.with("text_grammar_ref"), binding.with("text_grammar"));
        copyReference(profile, profile.with("symbol_catalog_ref"), binding.with("symbol_catalog"));
        copyReference(profile, profile.with("normalization_adapter_ref"), binding.with("normalization_adapter"));
        refreshBindingDigest(revision);
    }

    private void copyReference(ObjectNode profile, ObjectNode source, ObjectNode target) {
        target.put("id", source.required("id").asText());
        target.put("version", source.required("version").asText());
        target.with("digest").put("digest", source.required("digest").required("digest").asText());
    }

    private void refreshBindingDigest(ObjectNode revision) {
        ObjectNode binding = revision.with("profile_binding");
        String content = bindingLine("PROFILE", binding.with("profile")) + bindingLine("RULE_SET", binding.with("rule_set"))
                + bindingLine("GRAMMAR_ASSET", binding.with("text_grammar")) + bindingLine("SYMBOL_ASSET", binding.with("symbol_catalog"))
                + bindingLine("NORMALIZATION_DATA", binding.with("normalization_adapter"));
        binding.with("binding_digest").put("digest", sha256(content.getBytes(StandardCharsets.UTF_8)));
    }

    private String bindingLine(String role, ObjectNode reference) {
        return role + "\t" + reference.required("id").asText() + "\t" + reference.required("version").asText() + "\t"
                + reference.required("digest").required("digest").asText() + "\n";
    }

    private String packageDigest(ArrayNode entries) {
        List<ObjectNode> sorted = new ArrayList<>();
        entries.forEach(item -> sorted.add((ObjectNode) item));
        sorted.sort(Comparator.comparing(item -> item.required("logical_path").asText()));
        StringBuilder content = new StringBuilder();
        for (ObjectNode entry : sorted) content.append(entry.required("logical_path").asText()).append('\n').append(entry.required("byte_length").asLong()).append('\n')
                .append(entry.required("digest").required("digest").asText()).append('\n');
        return sha256(content.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void removeBoundAsset(ObjectNode asset, String role) {
        String expected = "RULE_SET".equals(role) ? "rule.iso.struct.exhibition.v1" : "symbol.link.structural.exhibition";
        ArrayNode values = asset.withArray("RULE_SET".equals(role) ? "rules" : "symbols");
        for (int index = 0; index < values.size(); index++) {
            String actual = "RULE_SET".equals(role) ? values.get(index).asText() : values.get(index).path("symbol_id").asText();
            if (expected.equals(actual)) { values.remove(index); return; }
        }
        throw new IllegalArgumentException("Bound asset is missing: " + expected);
    }

    private void flipDigest(ObjectNode digest) {
        String value = digest.required("digest").asText();
        digest.put("digest", value.substring(0, value.length() - 1) + (value.endsWith("0") ? "1" : "0"));
    }

    private Path isolatedAssetPath(Path profileRoot, String role) {
        ObjectNode profile;
        try { profile = objectMapper.readTree(Files.readAllBytes(profileRoot.resolve("profile.json"))).deepCopy(); }
        catch (Exception exception) { throw new IllegalStateException("Cannot read isolated Profile", exception); }
        for (JsonNode item : profile.with("manifest").withArray("entries")) if (role.equals(item.required("role").asText())) return profileRoot.resolve(item.required("logical_path").asText());
        throw new IllegalArgumentException("Profile manifest role is missing: " + role);
    }

    private ObjectNode fact(ObjectNode revision) { return (ObjectNode) revision.withArray("facts").get(0); }

    private void copyDirectory(Path source, Path target) throws Exception {
        try (Stream<Path> paths = Files.walk(source)) {
            for (Path path : paths.toList()) {
                Path destination = target.resolve(source.relativize(path));
                if (Files.isDirectory(path)) Files.createDirectories(destination); else Files.copy(path, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    private String optionalText(JsonNode node, String field) { return node.path(field).isTextual() ? node.path(field).asText() : null; }

    private OplGoldenReplayReportWriter.Attempt runAttempt(Path profileRoot, JsonNode goldenCase, Path workDirectory, int ordinal) {
        List<String> stages = new ArrayList<>();
        Path database = null;
        String modelId = null;
        Snapshot before = null;
        try {
            Files.createDirectories(workDirectory);
            Path basePath = profileRoot.resolve(goldenCase.required("base_revision_fixture").asText());
            Path candidatePath = profileRoot.resolve(goldenCase.required("input_revision_fixture").asText());
            SemanticRevision base = revisionReader.read(basePath);
            SemanticRevision candidate = revisionReader.read(candidatePath);
            modelId = candidate.modelId();
            assertBindings(goldenCase, base, candidate, profileRoot); stages.add("ASSET");
            TextGenerationAssets assets = new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot.getParent().getParent()))
                    .assemble(candidate.profileBinding());
            OplGrammar grammar = assets.grammar();

            if ("BLOCKED".equals(goldenCase.required("expectation").asText())) {
                database = databaseInitializer.initialize(workDirectory, base, basePath);
                before = snapshot(database, modelId);
                CommitResult result = committer(database, profileRoot)
                        .commit(command(goldenCase.required("case_id").asText(), base, candidate, grammar, Files.readAllBytes(candidatePath)));
                Snapshot after = snapshot(database, modelId);
                OplGoldenReplayReportWriter.Transaction transaction = after.delta(before);
                String expectedCode = goldenCase.required("expected_error_code").asText();
                if (!(result instanceof CommitResult.Rejected rejected) || !expectedCode.equals(detailCode(rejected))
                        || !matchesTransaction(goldenCase.required("expected_transaction"), transaction)) {
                    throw new ReplayMismatch("REPLAY_BLOCKED_STATE_MISMATCH", transaction);
                }
                stages.add("BLOCKED");
                return new OplGoldenReplayReportWriter.Attempt(ordinal, OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED,
                        null, null, stages, expectedCode, transaction);
            }

            SemanticRevision.Fact fact = assertFact(goldenCase, candidate); stages.add("FACT");
            assertProjection(goldenCase, assets.symbolCatalog().resolve(fact)); stages.add("PROJECTION");
            OplGenerationResult generated = generationService.generate(candidate, candidate.rootContextId(), assets);
            assertSentences(goldenCase, generated, grammar); stages.add("SENTENCE");
            assertTokens(goldenCase, generated); stages.add("TOKEN");
            assertTraces(goldenCase, generated); stages.add("TRACE");
            String traceSha = artifactWriter.sha256Traces(candidate.revisionId(), generated.traces());
            String expectedTraceSha = artifactWriter.sha256Traces(candidate.revisionId(), expectedTraces(goldenCase));
            if (!traceSha.equals(expectedTraceSha)) throw new ReplayMismatch("REPLAY_TRACE_MISMATCH", zeroTransaction());
            String artifactSha = artifactWriter.sha256(generated.artifact());
            if (!artifactSha.equals(goldenCase.required("expected_artifact_sha256").asText())) {
                throw new ReplayMismatch("REPLAY_ARTIFACT_DIGEST_MISMATCH", zeroTransaction());
            }
            stages.add("ARTIFACT");
            database = databaseInitializer.initialize(workDirectory, base, basePath);
            before = snapshot(database, modelId);
            OplGenerationResult generatedForCommit = generationService.generate(candidate, candidate.rootContextId(), assets);
            CommitResult result = committer(database, profileRoot)
                    .commit(command(goldenCase.required("case_id").asText(), base, candidate, grammar, Files.readAllBytes(candidatePath)));
            if (!(result instanceof CommitResult.Committed committed)) throw new ReplayMismatch("REPLAY_COMMIT_STATE_MISMATCH", zeroTransaction());
            Snapshot after = snapshot(database, modelId);
            OplGoldenReplayReportWriter.Transaction transaction = after.delta(before);
            assertCommittedState(database, candidate, generatedForCommit, committed, transaction, artifactSha, traceSha);
            stages.add("COMMIT");
            return new OplGoldenReplayReportWriter.Attempt(ordinal, OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED, artifactSha,
                    traceSha, stages, null, transaction);
        } catch (ReplayMismatch exception) {
            return failed(ordinal, stages, exception.code, transactionAfterFailure(database, modelId, before, exception.transaction));
        } catch (OplGenerationException exception) {
            return failed(ordinal, stages, exception.code().name(), transactionAfterFailure(database, modelId, before, zeroTransaction()));
        } catch (Exception exception) {
            return failed(ordinal, stages, "REPLAY_INTERNAL_ERROR", transactionAfterFailure(database, modelId, before, zeroTransaction()));
        }
    }

    private void assertBindings(JsonNode goldenCase, SemanticRevision base, SemanticRevision candidate, Path profileRoot) {
        if (!base.profileBinding().equals(candidate.profileBinding())) throw new ReplayMismatch("REPLAY_ASSET_MISMATCH", zeroTransaction());
        SemanticRevision.ProfileBinding binding = candidate.profileBinding();
        assertReference(goldenCase.required("profile_ref"), binding.profile());
        assertReference(goldenCase.required("rule_set_ref"), binding.ruleSet());
        assertReference(goldenCase.required("grammar_ref"), binding.textGrammar());
        assertReference(goldenCase.required("symbol_catalog_ref"), binding.symbolCatalog());
        assertReference(goldenCase.required("normalization_adapter_ref"), binding.normalizationAdapter());
        if (!goldenCase.required("binding_digest").asText().equals(binding.bindingDigest())) throw new ReplayMismatch("REPLAY_ASSET_MISMATCH", zeroTransaction());
        ProfileBindingSummary loaded = new FileProfilePackageLoader(profileRoot.getParent().getParent()).load(
                binding.profile().id(), binding.profile().version(), binding.profile().sha256());
        if (!same(loaded.ruleSet().sha256(), binding.ruleSet().sha256()) || !same(loaded.symbolCatalog().sha256(), binding.symbolCatalog().sha256())
                || !same(loaded.grammar().sha256(), binding.textGrammar().sha256()) || !same(loaded.normalization().sha256(), binding.normalizationAdapter().sha256())) {
            throw new ReplayMismatch("REPLAY_ASSET_MISMATCH", zeroTransaction());
        }
    }

    private void assertReference(JsonNode expected, SemanticRevision.AssetReference actual) {
        if (!expected.required("id").asText().equals(actual.id()) || !expected.required("version").asText().equals(actual.version())
                || !expected.required("sha256").asText().equals(actual.sha256())) throw new ReplayMismatch("REPLAY_ASSET_MISMATCH", zeroTransaction());
    }

    private SemanticRevision.Fact assertFact(JsonNode goldenCase, SemanticRevision candidate) {
        JsonNode expected = goldenCase.required("expected_normalized_fact");
        SemanticRevision.Fact actual = candidate.facts().stream().filter(item -> item.id().equals(expected.required("fact_id").asText())).findFirst()
                .orElseThrow(() -> new ReplayMismatch("REPLAY_FACT_MISMATCH", zeroTransaction()));
        if (!expected.required("fact_family").asText().equals(actual.family().name()) || !sameCapability(expected.required("capability_ref"), actual.capability())
                || !expected.required("direction").asText().equals(actual.direction().name()) || !sameSource(expected.required("source"), actual.source())
                || !expected.required("normalization").required("level").asText().equals(actual.normalization().level().name())
                || !sameEndpoints(expected.required("endpoints"), actual.endpoints()) || !sameModifiers(expected.path("modifiers"), actual.modifiers())
                || !sameLabels(expected.path("labels"), actual.labels()) || !sameCompleteness(expected.path("collection_completeness"), actual.collectionCompleteness().name())) {
            throw new ReplayMismatch("REPLAY_FACT_MISMATCH", zeroTransaction());
        }
        return actual;
    }

    private boolean sameCapability(JsonNode expected, SemanticRevision.CapabilityReference actual) {
        return expected.required("capability_id").asText().equals(actual.capabilityId()) && expected.required("profile_id").asText().equals(actual.profileId())
                && expected.required("profile_version").asText().equals(actual.profileVersion());
    }

    private boolean sameSource(JsonNode expected, SemanticRevision.SourceProvenance actual) {
        return expected.required("source_profile_id").asText().equals(actual.profileId()) && expected.required("source_profile_version").asText().equals(actual.profileVersion())
                && expected.required("source_kind").asText().equals(actual.sourceKind()) && expected.required("source_entity_id").asText().equals(actual.sourceEntityId());
    }

    private boolean sameEndpoints(JsonNode expected, List<SemanticRevision.Endpoint> actual) {
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) {
            SemanticRevision.Endpoint item = actual.get(index); JsonNode node = expected.get(index);
            if (!node.required("endpoint_id").asText().equals(item.id()) || !node.required("role").asText().equals(item.role())
                    || !node.required("target_kind").asText().equals(item.targetKind().name()) || !node.required("target_id").asText().equals(item.targetId())
                    || node.required("ordinal").asInt() != item.ordinal() || !sameNullableText(node.path("state_qualification_id"), item.stateQualificationId())) return false;
        }
        return true;
    }

    private boolean sameModifiers(JsonNode expected, List<SemanticRevision.Modifier> actual) {
        if (expected.isMissingNode()) return actual.isEmpty();
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) if (!expected.get(index).required("modifier_id").asText().equals(actual.get(index).id())
                || !expected.get(index).required("value").asText().equals(actual.get(index).value())) return false;
        return true;
    }

    private boolean sameLabels(JsonNode expected, List<SemanticRevision.Label> actual) {
        if (expected.isMissingNode()) return actual.isEmpty();
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) if (!expected.get(index).required("slot_id").asText().equals(actual.get(index).slotId())
                || !expected.get(index).required("text").asText().equals(actual.get(index).text())) return false;
        return true;
    }

    private boolean sameCompleteness(JsonNode expected, String actual) {
        return expected.isMissingNode() ? "NOT_APPLICABLE".equals(actual) : expected.asText().equals(actual);
    }

    private void assertProjection(JsonNode goldenCase, OplSymbolCatalogAssetLoader.Projection actual) {
        JsonNode expected = goldenCase.required("expected_projection");
        if (!expected.required("symbol_id").asText().equals(actual.symbolId()) || !sameNullableText(expected.path("line"), actual.line())
                || !sameNullableText(expected.path("source_marker"), actual.sourceMarker()) || !sameNullableText(expected.path("target_marker"), actual.targetMarker())
                || !sameNullableText(expected.path("junction_marker"), actual.junctionMarker()) || !sameNullableText(expected.path("annotation"), actual.annotation())
                || !sameNullableText(expected.path("completeness_annotation"), actual.completenessAnnotation())
                || !sameStrings(expected.required("label_slots"), actual.labelSlots()) || !expected.required("route_family").asText().equals(actual.routeFamily())) {
            throw new ReplayMismatch("REPLAY_PROJECTION_MISMATCH", zeroTransaction());
        }
    }

    private void assertSentences(JsonNode goldenCase, OplGenerationResult generated, OplGrammar grammar) {
        List<OplSentence> actual = sentences(generated);
        JsonNode expected = goldenCase.required("expected_sentences");
        if (actual.size() != expected.size()) throw new ReplayMismatch("REPLAY_SENTENCE_MISMATCH", zeroTransaction());
        for (int index = 0; index < actual.size(); index++) {
            OplSentence sentence = actual.get(index); JsonNode node = expected.get(index);
            String templateId = templateId(sentence);
            String slot = grammar.template(templateId).map(OplGrammar.Template::sentenceSlot).orElse(null);
            if (!node.required("sentence_id").asText().equals(sentence.sentenceId()) || node.required("ordinal").asInt() != sentence.ordinal()
                    || !node.required("sentence_slot").asText().equals(slot) || !node.required("template_id").asText().equals(templateId)
                    || !node.required("utf8_text").asText().equals(sentence.text()) || !sameStrings(node.required("generation_rule_ids"), sentence.generationRuleIds())
                    || !sameStrings(node.required("input_fact_ids"), sentence.inputFactIds())) throw new ReplayMismatch("REPLAY_SENTENCE_MISMATCH", zeroTransaction());
        }
    }

    private void assertTokens(JsonNode goldenCase, OplGenerationResult generated) {
        List<OplSentence> actual = sentences(generated); JsonNode expected = goldenCase.required("expected_sentences");
        for (int index = 0; index < actual.size(); index++) {
            List<OplToken> tokens = actual.get(index).tokens(); JsonNode expectedTokens = expected.get(index).required("tokens");
            if (tokens.size() != expectedTokens.size()) throw new ReplayMismatch("REPLAY_TOKEN_MISMATCH", zeroTransaction());
            for (int tokenIndex = 0; tokenIndex < tokens.size(); tokenIndex++) {
                OplToken token = tokens.get(tokenIndex); JsonNode node = expectedTokens.get(tokenIndex);
                if (!node.required("token_id").asText().equals(token.tokenId()) || !node.required("sentence_id").asText().equals(token.sentenceId())
                        || node.required("ordinal").asInt() != token.ordinal() || !node.required("text").asText().equals(token.text())
                        || !node.required("kind").asText().equals(token.kind().name()) || node.required("start_utf8_byte").asInt() != token.startUtf8Byte()
                        || node.required("end_utf8_byte").asInt() != token.endUtf8Byte() || !sameSourceRefs(node.required("source_refs"), token.sourceRefs())) {
                    throw new ReplayMismatch("REPLAY_TOKEN_MISMATCH", zeroTransaction());
                }
            }
        }
    }

    private void assertTraces(JsonNode goldenCase, OplGenerationResult generated) {
        JsonNode sentences = goldenCase.required("expected_sentences");
        if (generated.traces().size() != sentences.size()) throw new ReplayMismatch("REPLAY_TRACE_MISMATCH", zeroTransaction());
        for (int index = 0; index < generated.traces().size(); index++) {
            if (!sameTrace(sentences.get(index).required("trace"), generated.traces().get(index))) {
                throw new ReplayMismatch("REPLAY_TRACE_MISMATCH", zeroTransaction());
            }
        }
    }

    private List<OplTextTrace> expectedTraces(JsonNode goldenCase) {
        List<OplTextTrace> traces = new ArrayList<>();
        for (JsonNode sentence : goldenCase.required("expected_sentences")) {
            JsonNode trace = sentence.required("trace");
            traces.add(new OplTextTrace(
                    trace.required("trace_id").asText(),
                    trace.required("context_id").asText(),
                    strings(trace.required("fact_ids")),
                    strings(trace.required("input_element_ids")),
                    strings(trace.required("occurrence_ids")),
                    strings(trace.required("sentence_ids")),
                    strings(trace.required("rule_ids")),
                    trace.required("binding_digest").required("digest").asText(),
                    ranges(trace.required("token_ranges")),
                    sourceRefs(trace.required("source_refs"))));
        }
        return List.copyOf(traces);
    }

    private List<String> strings(JsonNode values) {
        List<String> result = new ArrayList<>();
        values.forEach(value -> result.add(value.asText()));
        return List.copyOf(result);
    }

    private List<OplTextTrace.TokenRange> ranges(JsonNode values) {
        List<OplTextTrace.TokenRange> result = new ArrayList<>();
        values.forEach(value -> result.add(new OplTextTrace.TokenRange(
                value.required("input_id").asText(), value.required("start_utf8_byte").asInt(), value.required("end_utf8_byte").asInt())));
        return List.copyOf(result);
    }

    private List<OplToken.SourceRef> sourceRefs(JsonNode values) {
        List<OplToken.SourceRef> result = new ArrayList<>();
        values.forEach(value -> result.add(new OplToken.SourceRef(
                OplToken.SourceKind.valueOf(value.required("source_kind").asText()),
                value.required("stable_id").asText(),
                nullableText(value, "field_path"),
                nullableInteger(value, "endpoint_ordinal"),
                nullableText(value, "sentence_slot"))));
        return List.copyOf(result);
    }

    private String nullableText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText();
    }

    private Integer nullableInteger(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asInt();
    }

    private boolean sameTrace(JsonNode expected, OplTextTrace actual) {
        return expected.required("trace_id").asText().equals(actual.traceId()) && expected.required("context_id").asText().equals(actual.contextId())
                && sameStrings(expected.required("fact_ids"), actual.factIds()) && sameStrings(expected.required("input_element_ids"), actual.inputElementIds())
                && sameStrings(expected.required("occurrence_ids"), actual.occurrenceIds()) && sameStrings(expected.required("sentence_ids"), actual.sentenceIds())
                && sameStrings(expected.required("rule_ids"), actual.ruleIds()) && sameDigest(expected.required("binding_digest"), actual.bindingDigest()) && sameRanges(expected.required("token_ranges"), actual.tokenRanges())
                && sameSourceRefs(expected.required("source_refs"), actual.sourceRefs());
    }

    private boolean sameRanges(JsonNode expected, List<OplTextTrace.TokenRange> actual) {
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) {
            OplTextTrace.TokenRange range = actual.get(index); JsonNode node = expected.get(index);
            if (!node.required("input_id").asText().equals(range.inputId()) || node.required("start_utf8_byte").asInt() != range.startUtf8Byte()
                    || node.required("end_utf8_byte").asInt() != range.endUtf8Byte()) return false;
        }
        return true;
    }

    private boolean sameSourceRefs(JsonNode expected, List<OplToken.SourceRef> actual) {
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) {
            OplToken.SourceRef ref = actual.get(index); JsonNode node = expected.get(index);
            if (!node.required("source_kind").asText().equals(ref.sourceKind().name()) || !node.required("stable_id").asText().equals(ref.stableId())
                    || !sameNullableText(node.path("field_path"), ref.fieldPath()) || !sameNullableInt(node.path("endpoint_ordinal"), ref.endpointOrdinal())
                    || !sameNullableText(node.path("sentence_slot"), ref.sentenceSlot())) return false;
        }
        return true;
    }

    private void assertCommittedState(Path database, SemanticRevision candidate, OplGenerationResult generated,
                                      CommitResult.Committed committed, OplGoldenReplayReportWriter.Transaction transaction,
                                      String expectedArtifactSha, String expectedTraceSha) throws Exception {
        int expectedTraceRows = generated.traces().stream().mapToInt(trace -> trace.factIds().size() * trace.sentenceIds().size()).sum();
        if (!candidate.revisionId().equals(committed.committedRevisionId()) || transaction.revisionDelta() != 1 || transaction.revisionParentDelta() != 1
                || transaction.textArtifactDelta() != 1 || transaction.textTraceDelta() != expectedTraceRows || transaction.findingDelta() != committed.validation().findings().size()
                || transaction.operationDelta() != 1 || transaction.receiptDelta() != 1 || !transaction.draftHeadChanged()) {
            throw new ReplayMismatch("REPLAY_COMMIT_STATE_MISMATCH", transaction);
        }
        String document;
        Set<TraceIndexTuple> storedTraceTuples;
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath())) {
            document = text(connection, "SELECT document_json FROM revision_document WHERE revision_id = ?", candidate.revisionId());
            storedTraceTuples = readTraceIndexTuples(connection, candidate.revisionId());
        }
        SemanticRevision reread = revisionReader.read(new ByteArrayInputStream(document.getBytes(StandardCharsets.UTF_8)));
        if (!candidate.equals(reread)) throw new ReplayMismatch("REPLAY_COMMIT_STATE_MISMATCH", transaction);
        JsonNode root = objectMapper.readTree(document); JsonNode text = root.required("text_artifact");
        if (!generated.artifact().artifactId().equals(text.required("artifact_id").asText()) || !"OPL".equals(text.required("modality").asText())
                || !generated.artifact().contextId().equals(text.required("context_id").asText()) || !sameGrammar(text.required("grammar_ref"), generated.artifact().grammarBinding())
                || !sameDigest(text.required("artifact_digest"), generated.artifact().artifactDigest()) || !sameStoredSentences(text.required("sentences"), sentences(generated))
                || !sameStoredTraces(root.required("text_traces"), generated.traces())
                || !expectedArtifactSha.equals(artifactWriter.sha256(generated.artifact()))
                || !expectedArtifactSha.equals(generated.artifact().artifactDigest())
                || !expectedTraceSha.equals(artifactWriter.sha256Traces(candidate.revisionId(), generated.traces()))
                || !traceIndexTuples(candidate.revisionId(), candidate.modelId(), generated.traces()).equals(storedTraceTuples)) {
            throw new ReplayMismatch("REPLAY_COMMIT_STATE_MISMATCH", transaction);
        }
    }

    private boolean sameGrammar(JsonNode expected, OplGrammar.Binding actual) {
        return expected.required("id").asText().equals(actual.id()) && expected.required("version").asText().equals(actual.version())
                && sameDigest(expected.required("digest"), actual.digest());
    }

    private boolean sameDigest(JsonNode expected, String actual) {
        return "sha256".equals(expected.required("algorithm").asText()) && actual.equals(expected.required("digest").asText());
    }

    private boolean sameStoredSentences(JsonNode expected, List<OplSentence> actual) {
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) {
            OplSentence sentence = actual.get(index); JsonNode node = expected.get(index);
            if (!node.required("sentence_id").asText().equals(sentence.sentenceId()) || !node.required("text").asText().equals(sentence.text())
                    || node.required("ordinal").asInt() != sentence.ordinal() || !sameStrings(node.required("generation_rule_ids"), sentence.generationRuleIds())
                    || !sameStrings(node.required("input_fact_ids"), sentence.inputFactIds()) || !sameStoredTokens(node.required("tokens"), sentence.tokens())) return false;
        }
        return true;
    }

    private boolean sameStoredTokens(JsonNode expected, List<OplToken> actual) {
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) {
            OplToken token = actual.get(index); JsonNode node = expected.get(index);
            if (!node.required("token_id").asText().equals(token.tokenId()) || !node.required("sentence_id").asText().equals(token.sentenceId())
                    || node.required("ordinal").asInt() != token.ordinal() || !node.required("text").asText().equals(token.text())
                    || !node.required("kind").asText().equals(token.kind().name()) || node.required("start_utf8_byte").asInt() != token.startUtf8Byte()
                    || node.required("end_utf8_byte").asInt() != token.endUtf8Byte() || !sameSourceRefs(node.required("source_refs"), token.sourceRefs())) return false;
        }
        return true;
    }

    private boolean sameStoredTraces(JsonNode expected, List<OplTextTrace> actual) {
        if (!expected.isArray() || expected.size() != actual.size()) return false;
        for (int index = 0; index < actual.size(); index++) if (!sameTrace(expected.get(index), actual.get(index))) return false;
        return true;
    }

    static Set<TraceIndexTuple> traceIndexTuples(String revisionId, String modelId, List<OplTextTrace> traces) {
        Set<TraceIndexTuple> result = new LinkedHashSet<>();
        for (OplTextTrace trace : traces) {
            for (String factId : trace.factIds()) {
                for (String sentenceId : trace.sentenceIds()) {
                    result.add(new TraceIndexTuple(revisionId, modelId, trace.traceId(), factId, sentenceId, trace.contextId()));
                }
            }
        }
        return Set.copyOf(result);
    }

    private Set<TraceIndexTuple> readTraceIndexTuples(Connection connection, String revisionId) throws Exception {
        Set<TraceIndexTuple> result = new LinkedHashSet<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT source_revision_id, model_id, trace_id, fact_id, sentence_id, context_id
                FROM text_trace_index
                WHERE source_revision_id = ?
                """)) {
            statement.setString(1, revisionId);
            try (var rows = statement.executeQuery()) {
                while (rows.next()) {
                    result.add(new TraceIndexTuple(rows.getString(1), rows.getString(2), rows.getString(3),
                            rows.getString(4), rows.getString(5), rows.getString(6)));
                }
            }
        }
        return Set.copyOf(result);
    }

    private String templateId(OplSentence sentence) {
        return sentence.tokens().stream().flatMap(token -> token.sourceRefs().stream())
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE)
                .map(OplToken.SourceRef::stableId)
                .findFirst()
                .orElseThrow(() -> new ReplayMismatch("REPLAY_SENTENCE_MISMATCH", zeroTransaction()));
    }

    private CandidateRevisionCommitter committer(Path database, Path profileRoot) {
        FileProfilePackageLoader loader = new FileProfilePackageLoader(profileRoot.getParent().getParent());
        return new CandidateRevisionCommitter(new SqliteRevisionCommitRepository(database), new ProfilePackageAssembler(loader));
    }

    private CandidateRevisionCommand command(String caseId, SemanticRevision base, SemanticRevision candidate, OplGrammar grammar, byte[] request) {
        var binding = base.profileBinding();
        return new CandidateRevisionCommand(OplGoldenReplayDatabaseInitializer.PROJECT_ID, candidate.modelId(),
                "command.golden." + sha256(caseId.getBytes(StandardCharsets.UTF_8)).substring(0, 32), base.revisionId(), base, candidate,
                new ProfileRuleBinding(binding.profile().id(), binding.profile().version(), binding.ruleSet().id(), binding.ruleSet().version()),
                grammar, sha256(request), "GOLDEN_REPLAY", Instant.parse("2000-01-01T00:00:00Z"));
    }

    private Snapshot snapshot(Path database, String modelId) throws Exception {
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath())) {
            return new Snapshot(count(connection, "revision_document"), count(connection, "revision_parent"), count(connection, "text_trace_index"),
                    count(connection, "finding_index"), count(connection, "operation_record"), count(connection, "idempotency_record"),
                    text(connection, "SELECT draft_head_revision_id FROM model_head WHERE model_id = ?", modelId),
                    integer(connection, "SELECT head_sequence FROM model_head WHERE model_id = ?", modelId));
        }
    }

    private boolean matchesTransaction(JsonNode expected, OplGoldenReplayReportWriter.Transaction actual) {
        return expected.required("revision_delta").asInt() == actual.revisionDelta() && expected.required("revision_parent_delta").asInt() == actual.revisionParentDelta()
                && expected.required("text_artifact_delta").asInt() == actual.textArtifactDelta() && expected.required("text_trace_delta").asInt() == actual.textTraceDelta()
                && expected.required("finding_delta").asInt() == actual.findingDelta() && expected.required("operation_delta").asInt() == actual.operationDelta()
                && expected.required("receipt_delta").asInt() == actual.receiptDelta() && expected.required("draft_head_changed").asBoolean() == actual.draftHeadChanged();
    }

    private String detailCode(CommitResult.Rejected rejected) {
        if (rejected.code() != CommitFailureCode.VALIDATION_BLOCKED) {
            return rejected.message();
        }
        return rejected.findings().stream().map(finding -> switch (finding.ruleId()) {
            case "core.state_owner_mismatch" -> "STATE_OWNER_MISMATCH";
            case "core.invalid_endpoint" -> "ENDPOINT_KIND_MISMATCH";
            default -> finding.ruleId();
        }).findFirst().orElse(rejected.code().name());
    }

    private OplGoldenReplayReportWriter.Transaction transactionAfterFailure(Path database, String modelId, Snapshot before,
                                                                             OplGoldenReplayReportWriter.Transaction fallback) {
        if (database == null || modelId == null || before == null) return fallback;
        try { return snapshot(database, modelId).delta(before); } catch (Exception ignored) { return fallback; }
    }

    private int count(Connection connection, String table) throws Exception { return integer(connection, "SELECT COUNT(*) FROM " + table); }
    private int integer(Connection connection, String query) throws Exception { try (var statement = connection.createStatement(); var result = statement.executeQuery(query)) { result.next(); return result.getInt(1); } }
    private int integer(Connection connection, String query, String value) throws Exception { try (PreparedStatement statement = connection.prepareStatement(query)) { statement.setString(1, value); try (var result = statement.executeQuery()) { result.next(); return result.getInt(1); } } }
    private String text(Connection connection, String query, String value) throws Exception { try (PreparedStatement statement = connection.prepareStatement(query)) { statement.setString(1, value); try (var result = statement.executeQuery()) { result.next(); return result.getString(1); } } }
    private List<OplSentence> sentences(OplGenerationResult generated) { return generated.artifact().paragraphs().stream().flatMap(item -> item.sentences().stream()).toList(); }
    private boolean sameStrings(JsonNode expected, List<String> actual) { if (!expected.isArray() || expected.size() != actual.size()) return false; for (int index = 0; index < actual.size(); index++) if (!expected.get(index).asText().equals(actual.get(index))) return false; return true; }
    private boolean sameNullableText(JsonNode expected, String actual) { return expected.isMissingNode() || expected.isNull() ? actual == null : expected.asText().equals(actual); }
    private boolean sameNullableInt(JsonNode expected, Integer actual) { return expected.isMissingNode() || expected.isNull() ? actual == null : expected.asInt() == actual; }
    private boolean same(String left, String right) { return left == null ? right == null : left.equals(right); }
    private OplGoldenReplayReportWriter.Transaction zeroTransaction() { return new OplGoldenReplayReportWriter.Transaction(0, 0, 0, 0, 0, 0, 0, false); }
    private OplGoldenReplayReportWriter.Attempt failed(int attempt, List<String> stages, String code, OplGoldenReplayReportWriter.Transaction transaction) { return new OplGoldenReplayReportWriter.Attempt(attempt, OplGoldenReplayReportWriter.ObservedStatus.FAILED, null, null, stages, code, transaction); }
    private String sha256(byte[] value) { try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); } catch (Exception exception) { throw new IllegalStateException(exception); } }

    private record AtomicInput(Path profileRoot, Path basePath, Path candidatePath, OplGoldenReplayReportWriter.ActualMutation mutation) { }

    private static final class CountingCommitRepository implements RevisionCommitRepository {
        private final RevisionCommitRepository delegate;
        private int commitCalls;

        private CountingCommitRepository(RevisionCommitRepository delegate) { this.delegate = delegate; }
        @Override public Optional<Head> currentHead(String modelId) { return delegate.currentHead(modelId); }
        @Override public Optional<Receipt> receipt(String operationId, String aggregateId, String commandId) { return delegate.receipt(operationId, aggregateId, commandId); }
        @Override public CommitResult.Committed commit(RevisionCommitBundle bundle) { commitCalls++; return delegate.commit(bundle); }
        int commitCalls() { return commitCalls; }
    }

    private record Snapshot(int revisions, int parents, int traces, int findings, int operations, int receipts, String headRevisionId, int headSequence) {
        OplGoldenReplayReportWriter.Transaction delta(Snapshot before) { return new OplGoldenReplayReportWriter.Transaction(revisions - before.revisions, parents - before.parents, revisions - before.revisions, traces - before.traces, findings - before.findings, operations - before.operations, receipts - before.receipts, !headRevisionId.equals(before.headRevisionId) || headSequence != before.headSequence); }
    }

    record TraceIndexTuple(String sourceRevisionId, String modelId, String traceId, String factId, String sentenceId, String contextId) {
    }

    private static final class ReplayMismatch extends RuntimeException {
        private final String code;
        private final OplGoldenReplayReportWriter.Transaction transaction;
        private ReplayMismatch(String code, OplGoldenReplayReportWriter.Transaction transaction) { this.code = code; this.transaction = transaction; }
    }
}
