package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.assets.FileProfilePackageLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HistoricalRevisionReplayServiceTest {

    private static final String PROFILE_ID = "profile.iso19450.2024.draft";
    private static final String PROFILE_DIGEST = "4cc3289722ab5c62e9273127318d5dcb383f7f0bdb801d23293afdef48fcbb00";
    private static final String GRAMMAR_DIGEST = "be315186135f2cfa525128532220b289e083fa4bc70bacb33a4287331467a9d1";
    private static final String BINDING_DIGEST = "35bf8490cdd363bc29380cc560d2667a70b72e474b739925b2cda4a598e3c037";

    @Test
    void replaysExactV01BindingTwiceWithoutMutatingHistoricalBytes() throws Exception {
        byte[] raw = historicalDocument();
        RevisionDocumentEnvelope document = new RevisionDocumentReaderRouter().read(raw);
        HistoricalRevisionReplayService service = new HistoricalRevisionReplayService(new FileProfilePackageLoader(profileRoot()));

        HistoricalRevisionReplayService.HistoricalRevisionReplayResult first = service.replay(document);
        HistoricalRevisionReplayService.HistoricalRevisionReplayResult second = service.replay(document);

        assertEquals(RevisionDocumentEnvelope.TextEvidenceAvailability.LEGACY_REPLAYED_TEXT, first.textEvidenceAvailability());
        assertEquals(true, first.readOnly());
        assertEquals(first.text(), second.text());
        assertEquals(first.textSha256(), second.textSha256());
        assertEquals(document.rawSha256(), first.inputRevisionSha256());
        assertArrayEquals(raw, historicalDocument());
    }

    @Test
    void classifiesMissingAndDigestMismatchedHistoricalGrammar(@TempDir Path temporaryRoot) throws Exception {
        byte[] raw = historicalDocument();
        RevisionDocumentEnvelope document = new RevisionDocumentReaderRouter().read(raw);
        Path copiedRoot = copyProfile(temporaryRoot);
        HistoricalRevisionReplayService service = new HistoricalRevisionReplayService(new FileProfilePackageLoader(copiedRoot));
        Path grammar = copiedRoot.resolve(PROFILE_ID).resolve("0.1.0/grammar/representative-opl-grammar.json");

        Files.delete(grammar);
        assertCode(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_MISSING, () -> service.replay(document));

        copyProfile(temporaryRoot);
        Files.writeString(grammar, "\n", java.nio.file.StandardOpenOption.APPEND);
        assertCode(HistoricalRevisionReplayException.Code.HISTORICAL_ASSET_DIGEST_MISMATCH, () -> service.replay(document));
    }

    @Test
    void rejectsHistoricalGrammarWithoutRegisteredRenderer() throws Exception {
        RevisionDocumentEnvelope document = new RevisionDocumentReaderRouter().read(historicalDocument());
        HistoricalRevisionReplayService service = new HistoricalRevisionReplayService(new FileProfilePackageLoader(profileRoot()), List.of());

        assertCode(HistoricalRevisionReplayException.Code.HISTORICAL_RENDERER_MISSING, () -> service.replay(document));
    }

    private void assertCode(HistoricalRevisionReplayException.Code expected, org.junit.jupiter.api.function.Executable action) {
        assertEquals(expected, assertThrows(HistoricalRevisionReplayException.class, action).code());
    }

    private byte[] historicalDocument() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode root = (ObjectNode) mapper.readTree(Files.readAllBytes(repositoryFile(
                "packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.struct.003.json")));
        root.put("schema_version", "0.1");
        root.remove(List.of("text_artifact", "text_traces", "validation_summary", "revision_digest"));
        ObjectNode binding = (ObjectNode) root.path("profile_binding");
        binding.withObject("profile").put("version", "0.1.0").withObject("digest").put("digest", PROFILE_DIGEST);
        binding.withObject("text_grammar").put("version", "0.1.0").withObject("digest").put("digest", GRAMMAR_DIGEST);
        binding.withObject("binding_digest").put("digest", BINDING_DIGEST);
        return mapper.writeValueAsBytes(root);
    }

    private Path copyProfile(Path root) throws IOException {
        Path source = profileRoot().resolve(PROFILE_ID).resolve("0.1.0");
        Path target = root.resolve(PROFILE_ID).resolve("0.1.0");
        try (var paths = Files.walk(source)) {
            for (Path path : paths.toList()) {
                Path destination = target.resolve(source.relativize(path));
                if (Files.isDirectory(path)) Files.createDirectories(destination);
                else Files.copy(path, destination, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return root;
    }

    private Path profileRoot() {
        return repositoryFile("packages/profiles");
    }

    private Path repositoryFile(String relative) {
        Path current = Path.of("").toAbsolutePath();
        while (current != null) {
            Path candidate = current.resolve(relative);
            if (Files.exists(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Missing repository path: " + relative);
    }
}
