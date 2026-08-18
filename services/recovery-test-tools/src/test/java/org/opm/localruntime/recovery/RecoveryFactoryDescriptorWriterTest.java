package org.opm.localruntime.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecoveryFactoryDescriptorWriterTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void writesBothDescriptorShapesWithSortedEntriesAndJcsDigests() throws Exception {
        Path fixture = temporaryDirectory.resolve("attempt/fixture");
        List<RecoveryFactoryDescriptorWriter.Input> assets = List.of(
                writeAsset(fixture, "packages/profiles/profile/0.2.0/profile.json", "PROFILE_PACKAGE"),
                writeAsset(fixture, "packages/profiles/profile/0.2.0/rules/rule.json", "RULE_SET"),
                writeAsset(fixture, "packages/profiles/profile/0.2.0/symbols/symbol.json", "SYMBOL_ASSET"),
                writeAsset(fixture, "packages/profiles/profile/0.2.0/grammar/grammar.json", "GRAMMAR_ASSET"),
                writeAsset(fixture, "packages/profiles/profile/0.2.0/normalization/normalization.json", "NORMALIZATION_DATA"));
        List<RecoveryFactoryDescriptorWriter.Input> inputs = List.of(
                write(fixture, "model-template.json", "SOURCE_TEMPLATE"),
                write(fixture, "gate-template.json", "SOURCE_TEMPLATE"),
                write(fixture, "base-revision.json", "BASE_REVISION"),
                assetInput(assets.get(0)), assetInput(assets.get(1)), assetInput(assets.get(2)), assetInput(assets.get(3)), assetInput(assets.get(4)),
                write(fixture, "storage/projects/project.recovery.state.001/project.db", "PROJECT_DB", "application/vnd.sqlite3"));

        RecoveryFactoryDescriptorWriter.Result result = new RecoveryFactoryDescriptorWriter()
                .write(temporaryDirectory.resolve("attempt"), "RCV-CANVAS-001.RULE_IDENTITY", "RECOVERY-COMMAND-PROCEDURAL-001", 1, assets, inputs);

        var asset = OBJECT_MAPPER.readTree(result.assetPath().toFile());
        var input = OBJECT_MAPPER.readTree(result.inputPath().toFile());
        assertEquals("ASSET_TREE", asset.required("scope").asText());
        assertEquals(5, asset.required("entries").size());
        assertEquals("INPUT_TREE", input.required("scope").asText());
        assertEquals(10, input.required("entries").size());
        assertEquals("dev-canvas-06.recovery-tree.RCV-CANVAS-001.RULE_IDENTITY.1.assets", asset.required("descriptor_id").asText());
        assertEquals("dev-canvas-06.recovery-tree.RCV-CANVAS-001.RULE_IDENTITY.1.input", input.required("descriptor_id").asText());
        assertEquals(Rfc8785JsonCanonicalizer.sha256(OBJECT_MAPPER.convertValue(input.required("entries"), Object.class)), input.required("tree_sha256").asText());
        assertTrue(Files.isRegularFile(result.assetPath()));
        assertTrue(Files.isRegularFile(result.inputPath()));
        assertFalse(Files.exists(result.inputPath().resolveSibling(".input-tree.json.tmp")));
    }

    @Test
    void rejectsSymlinkAndExistingDescriptorTargets() throws Exception {
        Path fixture = temporaryDirectory.resolve("attempt/fixture");
        RecoveryFactoryDescriptorWriter.Input asset = writeAsset(fixture, "packages/profiles/profile/0.2.0/profile.json", "PROFILE_PACKAGE");
        Path target = fixture.resolve("assets/packages/profiles/profile/0.2.0/target.json");
        Files.writeString(target, "{}", StandardCharsets.UTF_8);
        Path symlink = fixture.resolve("assets/packages/profiles/profile/0.2.0/rules/rule.json");
        Files.createDirectories(symlink.getParent());
        Files.createSymbolicLink(symlink, target);
        RecoveryFactoryDescriptorWriter writer = new RecoveryFactoryDescriptorWriter();

        assertThrows(RecoveryFactorySqliteMaterializer.RecoveryFactoryException.class,
                () -> writer.write(temporaryDirectory.resolve("attempt"), "RCV-CANVAS-001.RULE_IDENTITY", "RECOVERY-COMMAND-PROCEDURAL-001", 1,
                        List.of(asset, new RecoveryFactoryDescriptorWriter.Input("RULE_SET", "packages/profiles/profile/0.2.0/rules/rule.json", "application/json")), List.of()));
    }

    private RecoveryFactoryDescriptorWriter.Input assetInput(RecoveryFactoryDescriptorWriter.Input asset) {
        return new RecoveryFactoryDescriptorWriter.Input(asset.kind(), "assets/" + asset.path(), asset.mediaType());
    }

    private RecoveryFactoryDescriptorWriter.Input write(Path fixture, String path, String kind) throws Exception {
        return write(fixture, path, kind, "application/json");
    }

    private RecoveryFactoryDescriptorWriter.Input writeAsset(Path fixture, String path, String kind) throws Exception {
        RecoveryFactoryDescriptorWriter.Input input = write(fixture, "assets/" + path, kind);
        return new RecoveryFactoryDescriptorWriter.Input(input.kind(), path, input.mediaType());
    }

    private RecoveryFactoryDescriptorWriter.Input write(Path fixture, String path, String kind, String mediaType) throws Exception {
        Path file = fixture.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, "{}", StandardCharsets.UTF_8);
        return new RecoveryFactoryDescriptorWriter.Input(kind, path, mediaType);
    }
}
