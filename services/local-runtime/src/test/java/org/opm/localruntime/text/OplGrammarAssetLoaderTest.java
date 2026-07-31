package org.opm.localruntime.text;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.assets.AssetLoadException;
import org.opm.localruntime.semantic.SemanticRevision;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OplGrammarAssetLoaderTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void loadsVersionedConcreteTemplatesWithExactDigest() throws IOException {
        Path grammar = grammarPath();
        SemanticRevision.AssetReference reference = reference(grammar);

        OplGrammar loaded = new OplGrammarAssetLoader().load(grammar, reference);

        assertEquals(60, loaded.templates().size());
        assertEquals(20, loaded.templates().stream().filter(template -> template.capabilityId().startsWith("CAP-ISO-CTRL-")).count());
        assertEquals(24, loaded.templates().stream().filter(template -> template.capabilityId().startsWith("CAP-ISO-STRUCT-")).count());
        assertEquals("{Process} occurs if {Object} exists, in which case {Object} is consumed, otherwise {Process} is skipped.",
                loaded.template("opl.control.condition.transforming.consumption.v1").orElseThrow().pattern());
        assertEquals("REVERSE", loaded.template("opl.structural.tagged.bidirectional.reverse.v1").orElseThrow().sentenceSlot());
    }

    @Test
    void rejectsDigestMismatchAndNonConcreteTemplateAsset() throws IOException {
        Path grammar = temporaryDirectory.resolve("grammar.json");
        Files.writeString(grammar, "{\"asset_id\":\"grammar.opl.iso19450.2024.draft\",\"asset_version\":\"0.2.0\",\"templates\":[]}");
        SemanticRevision.AssetReference mismatched = new SemanticRevision.AssetReference(
                "grammar.opl.iso19450.2024.draft", "0.2.0", "a".repeat(64));

        AssetLoadException mismatch = assertThrows(AssetLoadException.class,
                () -> new OplGrammarAssetLoader().load(grammar, mismatched));
        assertTrue(mismatch.getMessage().contains("digest"));

        SemanticRevision.AssetReference emptyAssetReference = reference(grammar);
        AssetLoadException noConcreteTemplates = assertThrows(AssetLoadException.class,
                () -> new OplGrammarAssetLoader().load(grammar, emptyAssetReference));
        assertTrue(noConcreteTemplates.getMessage().contains("concrete templates"));
    }

    private Path grammarPath() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json");
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Grammar asset is not available");
    }

    private SemanticRevision.AssetReference reference(Path grammar) throws IOException {
        try {
            String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(grammar)));
            return new SemanticRevision.AssetReference("grammar.opl.iso19450.2024.draft", "0.2.0", digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
