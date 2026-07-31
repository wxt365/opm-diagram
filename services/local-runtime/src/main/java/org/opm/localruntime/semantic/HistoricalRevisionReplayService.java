package org.opm.localruntime.semantic;

import org.opm.localruntime.assets.AssetLoadException;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfileBindingSummary;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.assets.ProfilePackageDescriptor;

import java.util.List;
import java.util.Objects;

/** 历史 Revision 的只读文本回放入口，不依赖提交仓储。 */
public final class HistoricalRevisionReplayService {

    private final FileProfilePackageLoader packageLoader;
    private final List<LegacyOplRendererV01> renderers;

    public HistoricalRevisionReplayService(FileProfilePackageLoader packageLoader) {
        this(packageLoader, List.of(new LegacyOplRendererV01()));
    }

    public HistoricalRevisionReplayService(FileProfilePackageLoader packageLoader, List<LegacyOplRendererV01> renderers) {
        this.packageLoader = Objects.requireNonNull(packageLoader, "packageLoader must not be null");
        this.renderers = List.copyOf(Objects.requireNonNull(renderers, "renderers must not be null"));
    }

    public HistoricalRevisionReplayResult replay(RevisionDocumentEnvelope document) {
        Objects.requireNonNull(document, "document must not be null");
        if (!"MS-REV-001".equals(document.schemaId()) || !"0.1".equals(document.schemaVersion()) || !document.readOnly()) {
            throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_REVISION_UNSUPPORTED,
                    "Historical replay only accepts read-only MS-REV-001/0.1 documents");
        }
        SemanticRevision revision = document.revision();
        ProfilePackageDescriptor descriptor = loadPackage(revision.profileBinding());
        LegacyOplRendererV01 renderer = renderers.stream()
                .filter(candidate -> candidate.supports(revision.profileBinding().textGrammar()))
                .findFirst()
                .orElseThrow(() -> new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_RENDERER_MISSING,
                        "No legacy renderer is registered for the historical Grammar binding"));
        LegacyOplRendererV01.RenderedText rendered = renderer.render(revision, descriptor.requiredAsset("GRAMMAR_ASSET").path());
        return new HistoricalRevisionReplayResult(document.rawSha256(), rendered.text(), rendered.textSha256(),
                RevisionDocumentEnvelope.TextEvidenceAvailability.LEGACY_REPLAYED_TEXT, true);
    }

    private ProfilePackageDescriptor loadPackage(SemanticRevision.ProfileBinding binding) {
        try {
            ProfilePackageDescriptor descriptor = packageLoader.loadPackage(
                    binding.profile().id(), binding.profile().version(), binding.profile().sha256());
            verifyBinding(binding, descriptor.binding());
            if (!ProfilePackageAssembler.bindingDigest(binding).equals(binding.bindingDigest())) {
                throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_DIGEST_MISMATCH,
                        "Historical Revision binding digest differs from its five exact asset references");
            }
            return descriptor;
        } catch (HistoricalRevisionReplayException exception) {
            throw exception;
        } catch (AssetLoadException exception) {
            throw new HistoricalRevisionReplayException(classify(exception), exception.getMessage(), exception);
        }
    }

    private void verifyBinding(SemanticRevision.ProfileBinding revision, ProfileBindingSummary loaded) {
        if (!same(revision.profile(), loaded.profile()) || !same(revision.ruleSet(), loaded.ruleSet())
                || !same(revision.textGrammar(), loaded.grammar()) || !same(revision.symbolCatalog(), loaded.symbolCatalog())
                || !same(revision.normalizationAdapter(), loaded.normalization())) {
            throw new HistoricalRevisionReplayException(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_DIGEST_MISMATCH,
                    "Historical Revision binding differs from the installed Profile package");
        }
    }

    private boolean same(SemanticRevision.AssetReference revision, org.opm.localruntime.assets.AssetReference loaded) {
        return revision.id().equals(loaded.id()) && revision.version().equals(loaded.version()) && revision.sha256().equals(loaded.sha256());
    }

    private HistoricalRevisionReplayException.Code classify(AssetLoadException exception) {
        String message = exception.getMessage();
        if (message.contains("cannot be read") || message.contains("Required asset cannot be read")) {
            return HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_MISSING;
        }
        return HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_DIGEST_MISMATCH;
    }

    public record HistoricalRevisionReplayResult(
            String inputRevisionSha256,
            String text,
            String textSha256,
            RevisionDocumentEnvelope.TextEvidenceAvailability textEvidenceAvailability,
            boolean readOnly) { }
}
