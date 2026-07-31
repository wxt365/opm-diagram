package org.opm.localruntime.assets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FileProfilePackageLoaderTest {

    private static final String PROFILE_ID = "profile.iso19450.2024.draft";
    private static final String PROFILE_VERSION = "0.1.0";
    private static final String PACKAGE_DIGEST = "4cc3289722ab5c62e9273127318d5dcb383f7f0bdb801d23293afdef48fcbb00";
    private static final String CONCRETE_PROFILE_VERSION = "0.2.0";
    private static final String CONCRETE_PACKAGE_DIGEST = "5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c";

    @TempDir
    Path temporaryDirectory;

    @Test
    void loadsRepresentativeProfileWithExactBindings() throws IOException {
        Path assetRoot = copyProfile();

        ProfileBindingSummary summary = new FileProfilePackageLoader(assetRoot)
                .load(PROFILE_ID, PROFILE_VERSION, PACKAGE_DIGEST);

        assertEquals(PROFILE_ID, summary.profile().id());
        assertEquals(PACKAGE_DIGEST, summary.profile().sha256());
        assertEquals("rules.iso19450.2024.draft", summary.ruleSet().id());
        assertEquals("symbols.iso19450.2024.draft", summary.symbolCatalog().id());
        assertEquals("grammar.opl.iso19450.2024.draft", summary.grammar().id());
        assertEquals("normalization.iso19450.2024.draft", summary.normalization().id());
    }

    @Test
    void loadsConcreteGrammarAsANewImmutableProfileVersion() throws IOException {
        Path assetRoot = copyProfile(CONCRETE_PROFILE_VERSION);

        ProfileBindingSummary summary = new FileProfilePackageLoader(assetRoot)
                .load(PROFILE_ID, CONCRETE_PROFILE_VERSION, CONCRETE_PACKAGE_DIGEST);

        assertEquals(CONCRETE_PROFILE_VERSION, summary.profile().version());
        assertEquals(CONCRETE_PROFILE_VERSION, summary.grammar().version());
        assertEquals("0.1.0", summary.ruleSet().version());
    }

    @Test
    void rejectsUnexpectedRequestedPackageDigest() throws IOException {
        Path assetRoot = copyProfile();

        AssetLoadException exception = assertThrows(AssetLoadException.class,
                () -> new FileProfilePackageLoader(assetRoot).load(PROFILE_ID, PROFILE_VERSION,
                        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));

        assertTrue(exception.getMessage().contains("Requested profile package digest"));
    }

    @Test
    void rejectsTamperedRequiredAsset() throws IOException {
        Path assetRoot = copyProfile();
        Files.writeString(assetRoot.resolve(PROFILE_ID).resolve(PROFILE_VERSION)
                .resolve("grammar/representative-opl-grammar.json"), "{}\n");

        AssetLoadException exception = assertThrows(AssetLoadException.class,
                () -> new FileProfilePackageLoader(assetRoot).load(PROFILE_ID, PROFILE_VERSION, PACKAGE_DIGEST));

        assertTrue(exception.getMessage().contains("Manifest byte length")
                || exception.getMessage().contains("Manifest digest"));
    }

    @Test
    void rejectsMissingRequiredAsset() throws IOException {
        Path assetRoot = copyProfile();
        Files.delete(assetRoot.resolve(PROFILE_ID).resolve(PROFILE_VERSION)
                .resolve("symbols/representative-symbol-catalog.json"));

        AssetLoadException exception = assertThrows(AssetLoadException.class,
                () -> new FileProfilePackageLoader(assetRoot).load(PROFILE_ID, PROFILE_VERSION, PACKAGE_DIGEST));

        assertTrue(exception.getMessage().contains("Required asset cannot be read"));
    }

    @Test
    void rejectsManifestPathTraversal() throws IOException {
        Path assetRoot = copyProfile();
        Path profile = assetRoot.resolve(PROFILE_ID).resolve(PROFILE_VERSION).resolve("profile.json");
        Files.writeString(profile, Files.readString(profile).replace(
                "symbols/representative-symbol-catalog.json",
                "../representative-symbol-catalog.json"));

        AssetLoadException exception = assertThrows(AssetLoadException.class,
                () -> new FileProfilePackageLoader(assetRoot).load(PROFILE_ID, PROFILE_VERSION, PACKAGE_DIGEST));

        assertTrue(exception.getMessage().contains("escapes the profile package"));
    }

    @Test
    void rejectsProfileVersionThatDoesNotMatchTheRequest() throws IOException {
        Path assetRoot = copyProfile();
        Path profile = assetRoot.resolve(PROFILE_ID).resolve(PROFILE_VERSION).resolve("profile.json");
        Files.writeString(profile, Files.readString(profile).replaceFirst(
                "\"package_version\": \"0.1.0\"",
                "\"package_version\": \"0.1.1\""));

        AssetLoadException exception = assertThrows(AssetLoadException.class,
                () -> new FileProfilePackageLoader(assetRoot).load(PROFILE_ID, PROFILE_VERSION, PACKAGE_DIGEST));

        assertTrue(exception.getMessage().contains("Profile identity does not match"));
    }

    private Path copyProfile() throws IOException {
        return copyProfile(PROFILE_VERSION);
    }

    private Path copyProfile(String profileVersion) throws IOException {
        Path assetRoot = temporaryDirectory.resolve("profiles");
        Path source = findProfileSource(profileVersion);
        Path target = assetRoot.resolve(PROFILE_ID).resolve(profileVersion);
        try (Stream<Path> paths = Files.walk(source)) {
            paths.forEach(path -> copy(path, source, target));
        }
        return assetRoot;
    }

    private Path findProfileSource() {
        return findProfileSource(PROFILE_VERSION);
    }

    private Path findProfileSource(String profileVersion) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("packages/profiles").resolve(PROFILE_ID).resolve(profileVersion);
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Representative profile package is not available for the test");
    }

    private void copy(Path source, Path sourceRoot, Path targetRoot) {
        Path target = targetRoot.resolve(sourceRoot.relativize(source));
        try {
            if (Files.isDirectory(source)) {
                Files.createDirectories(target);
            } else {
                Files.createDirectories(target.getParent());
                Files.copy(source, target);
            }
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
