package org.opm.localruntime.assets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.OplToken;
import org.opm.localruntime.text.TextGenerationAssets;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.opm.localruntime.releaseevidence.fault.E2EFaultContext;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfilePackageAssemblerTest {

    private static final String PROFILE_ID = "profile.iso19450.2024.draft";
    private static final String PROFILE_VERSION = "0.2.0";
    private static final String PACKAGE_DIGEST = "5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c";
    private static final String BINDING_DIGEST = "93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d";

    @TempDir
    Path temporaryDirectory;

    @Test
    void assemblesExactProfileAssetsAndCapabilityIndexes() {
        ProfilePackageAssembler assembler = new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot()));

        TextGenerationAssets assets = assembler.assemble(binding());

        assertEquals(BINDING_DIGEST, assets.bindingDigest());
        assertEquals(60, assets.grammar().templates().size());
        assertTrue(assets.ruleSet().contains("rule.iso.struct.exhibition.v1"));
        assertTrue(assets.symbolCatalog().containsSymbol("symbol.link.structural.exhibition"));
        assertEquals("rule.iso.proc.state-consumption.endpoints.v1",
                assets.capability("CAP-ISO-PROC-006").ruleRef());
        assertEquals("representative-only", assets.normalizationPolicy().name());
    }

    @Test
    void rejectsBindingDigestBeforeTextGeneration() {
        SemanticRevision.ProfileBinding expected = binding();
        SemanticRevision.ProfileBinding tampered = new SemanticRevision.ProfileBinding(
                expected.profile(), expected.ruleSet(), expected.textGrammar(), expected.symbolCatalog(), expected.normalizationAdapter(),
                "a".repeat(64));

        ProfilePackageAssemblyException exception = assertThrows(ProfilePackageAssemblyException.class,
                () -> new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot())).assemble(tampered));

        assertEquals(ProfilePackageAssemblyException.Code.PROFILE_BINDING_DIGEST_MISMATCH, exception.code());
    }

    @Test
    void invokesE2eAssetHookBeforeTheSymbolCatalogIsLoaded() {
        AtomicInteger calls = new AtomicInteger();
        E2EFaultPort faultPort = new E2EFaultPort() {
            @Override public E2EFaultContext contextFor(CandidateRevisionCommand command) { return E2EFaultContext.Disabled.INSTANCE; }
            @Override public void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset) {
                calls.incrementAndGet();
                assertEquals("SYMBOL_ASSET", asset.role());
                throw new ProfilePackageAssemblyException(ProfilePackageAssemblyException.Code.PROFILE_ASSET_MISSING, "E2E asset fault");
            }
            @Override public void beforeRevisionInsert(E2EFaultContext context) { }
            @Override public RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head) { return head; }
        };

        ProfilePackageAssemblyException exception = assertThrows(ProfilePackageAssemblyException.class,
                () -> new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot()), faultPort)
                        .assemble(binding(), new E2EFaultContext.Active("E2E-CANVAS-007.ASSET_MISSING", 1, "project.001", "model.001",
                                "revision.001", "revision.002", "command.001", PROFILE_ID, PROFILE_VERSION, "a".repeat(64))));

        assertEquals(ProfilePackageAssemblyException.Code.PROFILE_ASSET_MISSING, exception.code());
        assertEquals(1, calls.get());
    }

    @Test
    void assemblesOnlyVerifiedDirectProfileRootWithoutHierarchicalFallback() throws Exception {
        Path source = profileRoot().resolve(PROFILE_ID).resolve(PROFILE_VERSION);
        Path directRoot = temporaryDirectory.resolve("profile/assets");
        Set<FileProfilePackageLoader.DirectPackageFile> verified = new LinkedHashSet<>();
        for (String relative : Set.of("profile.json", "rules/representative-rule-set.json", "symbols/representative-symbol-catalog.json",
                "grammar/representative-opl-grammar.json", "normalization/representative-normalization.json")) {
            Path target = directRoot.resolve(relative);
            Files.createDirectories(target.getParent());
            Files.copy(source.resolve(relative), target);
            verified.add(new FileProfilePackageLoader.DirectPackageFile(kind(relative), relative, Files.size(target), sha256(Files.readAllBytes(target))));
        }

        TextGenerationAssets assets = new ProfilePackageAssembler(
                FileProfilePackageLoader.forVerifiedDirectPackageRoot(directRoot, verified)).assemble(binding());

        assertEquals(BINDING_DIGEST, assets.bindingDigest());
        Files.writeString(directRoot.resolve("unexpected.json"), "{};");
        assertThrows(ProfilePackageAssemblyException.class,
                () -> new ProfilePackageAssembler(FileProfilePackageLoader.forVerifiedDirectPackageRoot(directRoot, verified)).assemble(binding()));
    }

    @Test
    void ruleSetLoaderRejectsDuplicateRules() throws Exception {
        Path source = profileRoot().resolve(PROFILE_ID).resolve(PROFILE_VERSION).resolve("rules/representative-rule-set.json");
        String content = java.nio.file.Files.readString(source).replace(
                "\"rule.iso.thing.kind.v1\",",
                "\"rule.iso.thing.kind.v1\",\n    \"rule.iso.thing.kind.v1\",");
        Path temporary = java.nio.file.Files.createTempFile("rule-set-duplicate", ".json");
        try {
            java.nio.file.Files.writeString(temporary, content);
            String digest = sha256(java.nio.file.Files.readAllBytes(temporary));
            AssetLoadException exception = assertThrows(AssetLoadException.class,
                    () -> new RuleSetAssetLoader().load(temporary,
                            new SemanticRevision.AssetReference("rules.iso19450.2024.draft", "0.1.0", digest)));
            assertTrue(exception.getMessage().contains("duplicate"));
        } finally {
            java.nio.file.Files.deleteIfExists(temporary);
        }
    }

    @Test
    void generationWithAssembledAssetsUsesProfileRulesInsteadOfTemplateIds() {
        SemanticRevision revision = new SemanticRevisionReader().read(profileRoot().resolve(PROFILE_ID).resolve(PROFILE_VERSION)
                .resolve("golden/fixtures/g-opl-proc-001-consumption-state.json"));
        TextGenerationAssets assets = new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot()))
                .assemble(revision.profileBinding());

        OplGenerationResult result = new OplTextGenerationService().generate(revision, revision.rootContextId(), assets);

        String ruleId = "rule.iso.proc.state-consumption.endpoints.v1";
        assertEquals(java.util.List.of(ruleId), result.artifact().paragraphs().getFirst().sentences().getFirst().generationRuleIds());
        assertEquals(java.util.List.of(ruleId), result.traces().getFirst().ruleIds());
        assertTrue(result.artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .flatMap(token -> token.sourceRefs().stream())
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.RULE)
                .allMatch(ref -> ruleId.equals(ref.stableId())));
        assertTrue(result.traces().getFirst().sourceRefs().stream()
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.GRAMMAR)
                .allMatch(ref -> ref.fieldPath().startsWith("templates[template_id=") && !ref.fieldPath().startsWith("digest=")));
    }

    private SemanticRevision.ProfileBinding binding() {
        FileProfilePackageLoader loader = new FileProfilePackageLoader(profileRoot());
        ProfileBindingSummary summary = loader.load(PROFILE_ID, PROFILE_VERSION, PACKAGE_DIGEST);
        SemanticRevision.AssetReference profile = reference(summary.profile());
        SemanticRevision.ProfileBinding binding = new SemanticRevision.ProfileBinding(profile, reference(summary.ruleSet()),
                reference(summary.grammar()), reference(summary.symbolCatalog()), reference(summary.normalization()), BINDING_DIGEST);
        assertEquals(BINDING_DIGEST, ProfilePackageAssembler.bindingDigest(binding));
        return binding;
    }

    private SemanticRevision.AssetReference reference(AssetReference value) {
        return new SemanticRevision.AssetReference(value.id(), value.version(), value.sha256());
    }

    private Path profileRoot() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("packages/profiles");
            if (java.nio.file.Files.isDirectory(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Profile package is not available");
    }

    private String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String kind(String relative) {
        return switch (relative) {
            case "profile.json" -> "PROFILE_PACKAGE";
            case "rules/representative-rule-set.json" -> "RULE_SET";
            case "symbols/representative-symbol-catalog.json" -> "SYMBOL_ASSET";
            case "grammar/representative-opl-grammar.json" -> "GRAMMAR_ASSET";
            case "normalization/representative-normalization.json" -> "NORMALIZATION_DATA";
            default -> throw new IllegalArgumentException(relative);
        };
    }
}
