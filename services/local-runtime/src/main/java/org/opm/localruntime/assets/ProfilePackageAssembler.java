package org.opm.localruntime.assets;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.releaseevidence.fault.E2EFaultContext;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.opm.localruntime.text.OplGrammar;
import org.opm.localruntime.text.OplGrammarAssetLoader;
import org.opm.localruntime.text.TextGenerationAssets;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;

/** 按 Revision 的五项 binding 装配文本生成资产，禁止以内存 Grammar 绕过包验证。 */
public final class ProfilePackageAssembler {

    private final FileProfilePackageLoader packageLoader;
    private final RuleSetAssetLoader ruleSetLoader;
    private final OplSymbolCatalogAssetLoader symbolCatalogLoader;
    private final OplGrammarAssetLoader grammarLoader;
    private final NormalizationAssetLoader normalizationLoader;
    private final E2EFaultPort e2eFaultPort;

    public ProfilePackageAssembler(FileProfilePackageLoader packageLoader) {
        this(packageLoader, E2EFaultPort.NOOP);
    }

    public ProfilePackageAssembler(FileProfilePackageLoader packageLoader, E2EFaultPort e2eFaultPort) {
        this(packageLoader, new RuleSetAssetLoader(), new OplSymbolCatalogAssetLoader(), new OplGrammarAssetLoader(), new NormalizationAssetLoader(), e2eFaultPort);
    }

    ProfilePackageAssembler(
            FileProfilePackageLoader packageLoader,
            RuleSetAssetLoader ruleSetLoader,
            OplSymbolCatalogAssetLoader symbolCatalogLoader,
            OplGrammarAssetLoader grammarLoader,
            NormalizationAssetLoader normalizationLoader) {
        this(packageLoader, ruleSetLoader, symbolCatalogLoader, grammarLoader, normalizationLoader, E2EFaultPort.NOOP);
    }

    ProfilePackageAssembler(
            FileProfilePackageLoader packageLoader,
            RuleSetAssetLoader ruleSetLoader,
            OplSymbolCatalogAssetLoader symbolCatalogLoader,
            OplGrammarAssetLoader grammarLoader,
            NormalizationAssetLoader normalizationLoader,
            E2EFaultPort e2eFaultPort) {
        this.packageLoader = Objects.requireNonNull(packageLoader, "packageLoader must not be null");
        this.ruleSetLoader = Objects.requireNonNull(ruleSetLoader, "ruleSetLoader must not be null");
        this.symbolCatalogLoader = Objects.requireNonNull(symbolCatalogLoader, "symbolCatalogLoader must not be null");
        this.grammarLoader = Objects.requireNonNull(grammarLoader, "grammarLoader must not be null");
        this.normalizationLoader = Objects.requireNonNull(normalizationLoader, "normalizationLoader must not be null");
        this.e2eFaultPort = Objects.requireNonNull(e2eFaultPort, "e2eFaultPort must not be null");
    }

    public TextGenerationAssets assemble(SemanticRevision.ProfileBinding binding) {
        return assemble(binding, E2EFaultContext.Disabled.INSTANCE);
    }

    public TextGenerationAssets assemble(SemanticRevision.ProfileBinding binding, E2EFaultContext context) {
        Objects.requireNonNull(binding, "binding must not be null");
        Objects.requireNonNull(context, "context must not be null");
        try {
            ProfilePackageDescriptor descriptor = packageLoader.loadPackage(
                    binding.profile().id(), binding.profile().version(), binding.profile().sha256());
            verifyBinding(binding, descriptor.binding());
            String actualBindingDigest = bindingDigest(binding);
            if (!actualBindingDigest.equals(binding.bindingDigest())) {
                throw new ProfilePackageAssemblyException(ProfilePackageAssemblyException.Code.PROFILE_BINDING_DIGEST_MISMATCH,
                        "Revision binding digest does not match its five asset references");
            }
            OplGrammar grammar = grammarLoader.load(descriptor.requiredAsset("GRAMMAR_ASSET").path(), binding.textGrammar());
            RuleSetAssetLoader.RuleSet ruleSet = ruleSetLoader.load(descriptor.requiredAsset("RULE_SET").path(), binding.ruleSet());
            ProfilePackageDescriptor.RequiredAsset symbolAsset = descriptor.requiredAsset("SYMBOL_ASSET");
            e2eFaultPort.beforeSymbolAssetLoad(context, symbolAsset);
            OplSymbolCatalogAssetLoader.Catalog symbols = symbolCatalogLoader.load(symbolAsset.path(), binding.symbolCatalog());
            NormalizationAssetLoader.Policy normalization = normalizationLoader.load(
                    descriptor.requiredAsset("NORMALIZATION_DATA").path(), binding.normalizationAdapter());
            Map<String, ProfilePackageDescriptor.CapabilityBinding> capabilities = descriptor.capabilityIndex();
            validateCapabilities(capabilities, ruleSet, symbols, grammar);
            return new TextGenerationAssets(binding, grammar, ruleSet, symbols, normalization, capabilities);
        } catch (ProfilePackageAssemblyException exception) {
            throw exception;
        } catch (AssetLoadException exception) {
            throw new ProfilePackageAssemblyException(classify(exception), exception.getMessage(), exception);
        }
    }

    private void verifyBinding(SemanticRevision.ProfileBinding revision, ProfileBindingSummary loaded) {
        if (!same(revision.profile(), loaded.profile()) || !same(revision.ruleSet(), loaded.ruleSet())
                || !same(revision.textGrammar(), loaded.grammar()) || !same(revision.symbolCatalog(), loaded.symbolCatalog())
                || !same(revision.normalizationAdapter(), loaded.normalization())) {
            throw new ProfilePackageAssemblyException(ProfilePackageAssemblyException.Code.PROFILE_REVISION_BINDING_MISMATCH,
                    "Revision binding differs from the installed Profile package");
        }
    }

    private void validateCapabilities(
            Map<String, ProfilePackageDescriptor.CapabilityBinding> capabilities,
            RuleSetAssetLoader.RuleSet ruleSet,
            OplSymbolCatalogAssetLoader.Catalog symbols,
            OplGrammar grammar) {
        for (ProfilePackageDescriptor.CapabilityBinding capability : capabilities.values()) {
            if (!ruleSet.contains(capability.ruleRef()) || !symbols.containsSymbol(capability.symbolRef())
                    || grammar.templates().stream().noneMatch(template -> template.capabilityId().equals(capability.capabilityId()))) {
                throw new ProfilePackageAssemblyException(ProfilePackageAssemblyException.Code.PROFILE_CAPABILITY_BINDING_MISMATCH,
                        "Profile capability does not bind an installed Rule, Symbol and Template: " + capability.capabilityId());
            }
        }
    }

    private boolean same(SemanticRevision.AssetReference revision, AssetReference loaded) {
        return revision.id().equals(loaded.id()) && revision.version().equals(loaded.version()) && revision.sha256().equals(loaded.sha256());
    }

    public static String bindingDigest(SemanticRevision.ProfileBinding binding) {
        String content = line("PROFILE", binding.profile())
                + line("RULE_SET", binding.ruleSet())
                + line("GRAMMAR_ASSET", binding.textGrammar())
                + line("SYMBOL_ASSET", binding.symbolCatalog())
                + line("NORMALIZATION_DATA", binding.normalizationAdapter());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String line(String role, SemanticRevision.AssetReference reference) {
        return role + "\t" + reference.id() + "\t" + reference.version() + "\t" + reference.sha256() + "\n";
    }

    private ProfilePackageAssemblyException.Code classify(AssetLoadException exception) {
        String message = exception.getMessage();
        if (message.contains("cannot be read") || message.contains("Required asset cannot be read")) {
            return ProfilePackageAssemblyException.Code.PROFILE_ASSET_MISSING;
        }
        if (message.contains("digest") || message.contains("byte length")) {
            return ProfilePackageAssemblyException.Code.PROFILE_ASSET_DIGEST_MISMATCH;
        }
        if (message.contains("identity")) {
            return ProfilePackageAssemblyException.Code.PROFILE_ASSET_IDENTITY_MISMATCH;
        }
        if (message.contains("package digest")) {
            return ProfilePackageAssemblyException.Code.PROFILE_PACKAGE_DIGEST_MISMATCH;
        }
        return ProfilePackageAssemblyException.Code.PROFILE_PACKAGE_INVALID;
    }
}
