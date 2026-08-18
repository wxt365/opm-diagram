package org.opm.localruntime.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 在 Recovery attempt staging 目录中原子生成两份冻结 Tree Descriptor。 */
final class RecoveryFactoryDescriptorWriter {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    Result write(Path stagingAttemptRoot, String caseId, String baseScenarioId, int attemptOrdinal,
                 List<Input> profileAssets, List<Input> inputFiles) {
        try {
            Path fixture = stagingAttemptRoot.resolve("fixture").normalize();
            requireDirectory(fixture);
            List<Entry> assetEntries = entries(fixture.resolve("assets"), profileAssets);
            if (assetEntries.size() != 5) throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery asset descriptor must contain five entries.");
            Map<String, Object> asset = descriptor(caseId, attemptOrdinal, "ASSET_TREE", "fixture/assets", assetEntries);
            Path assetPath = fixture.resolve("descriptors/asset-tree.json");
            atomicWrite(assetPath, OBJECT_MAPPER.writeValueAsBytes(asset));

            List<Input> allInputFiles = new ArrayList<>(inputFiles);
            allInputFiles.add(new Input("TREE_DESCRIPTOR", fixture.relativize(assetPath).toString(), "application/json"));
            List<Entry> inputEntries = entries(fixture, allInputFiles);
            if (inputEntries.size() < 10 || inputEntries.size() > 11) {
                throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery input descriptor entry count is invalid.");
            }
            Map<String, Object> input = descriptor(caseId, attemptOrdinal, "INPUT_TREE", "fixture", inputEntries);
            Path inputPath = fixture.resolve("descriptors/input-tree.json");
            atomicWrite(inputPath, OBJECT_MAPPER.writeValueAsBytes(input));
            return new Result(assetPath, inputPath, sha256(OBJECT_MAPPER.writeValueAsBytes(input)),
                    sha256(Rfc8785JsonCanonicalizer.canonicalize(input).getBytes(StandardCharsets.UTF_8)));
        } catch (RecoveryFactorySqliteMaterializer.RecoveryFactoryException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Cannot write Recovery Tree Descriptor.", exception);
        }
    }

    private List<Entry> entries(Path root, List<Input> inputs) throws IOException {
        requireDirectory(root);
        List<Entry> entries = new ArrayList<>();
        for (Input input : inputs) {
            validateRelativePath(input.path());
            Path file = root.resolve(input.path()).normalize();
            if (!file.startsWith(root)) throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor path escapes its root.");
            requireRegularUnlinkedFile(file);
            byte[] bytes = Files.readAllBytes(file);
            entries.add(new Entry(input.kind(), input.path(), input.mediaType(), bytes.length, sha256(bytes)));
        }
        entries.sort(Comparator.comparing(Entry::path, RecoveryFactoryDescriptorWriter::compareUtf8));
        for (int index = 1; index < entries.size(); index++) {
            if (entries.get(index - 1).path().equals(entries.get(index).path())
                    || entries.get(index - 1).path().equalsIgnoreCase(entries.get(index).path())) {
                throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor contains duplicate or case-colliding paths.");
            }
        }
        return List.copyOf(entries);
    }

    private Map<String, Object> descriptor(String caseId, int attemptOrdinal,
                                           String scope, String rootPath, List<Entry> entries) {
        List<Map<String, Object>> values = entries.stream().map(Entry::asMap).toList();
        Map<String, Object> descriptor = new LinkedHashMap<>();
        descriptor.put("schema_id", "OPM-DEV-CANVAS-06-RECOVERY-TREE-DESCRIPTOR-001");
        descriptor.put("schema_version", "0.1");
        descriptor.put("descriptor_id", "dev-canvas-06.recovery-tree." + caseId + "." + attemptOrdinal
                + ("ASSET_TREE".equals(scope) ? ".assets" : ".input"));
        descriptor.put("descriptor_version", "0.1.0");
        descriptor.put("scope", scope);
        descriptor.put("root_path", rootPath);
        descriptor.put("entries", values);
        descriptor.put("tree_sha256", sha256(Rfc8785JsonCanonicalizer.canonicalize(values).getBytes(StandardCharsets.UTF_8)));
        descriptor.put("descriptor_payload_sha256", sha256(Rfc8785JsonCanonicalizer.canonicalize(descriptor).getBytes(StandardCharsets.UTF_8)));
        return descriptor;
    }

    private void atomicWrite(Path path, byte[] bytes) throws IOException {
        Files.createDirectories(path.getParent());
        Path temporary = path.resolveSibling("." + path.getFileName() + ".tmp");
        if (Files.exists(path, LinkOption.NOFOLLOW_LINKS) || Files.exists(temporary, LinkOption.NOFOLLOW_LINKS)) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor target is not fresh.");
        }
        try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            channel.write(ByteBuffer.wrap(bytes));
            channel.force(true);
        }
        try {
            Files.move(temporary, path, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.deleteIfExists(temporary);
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor atomic rename is unavailable.", exception);
        } catch (IOException exception) {
            Files.deleteIfExists(temporary);
            throw exception;
        }
    }

    private void requireDirectory(Path path) throws IOException {
        if (Files.isSymbolicLink(path) || !Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor root must be a non-symlink directory.");
        }
    }

    private void requireRegularUnlinkedFile(Path path) throws IOException {
        if (Files.isSymbolicLink(path) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor entry must be a regular file.");
        }
        Object linkCount = Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS);
        if (!(linkCount instanceof Number number) || number.longValue() != 1L) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor entry must have link count one.");
        }
    }

    private void validateRelativePath(String path) {
        if (path == null || path.isBlank() || path.startsWith("/") || path.contains("\\")
                || java.util.Arrays.stream(path.split("/", -1)).anyMatch(segment -> segment.isBlank() || ".".equals(segment) || "..".equals(segment))) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery descriptor entry path is unsafe.");
        }
    }

    private static int compareUtf8(String left, String right) {
        byte[] leftBytes = left.getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = right.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index < Math.min(leftBytes.length, rightBytes.length); index++) {
            int compared = Byte.compareUnsigned(leftBytes[index], rightBytes[index]);
            if (compared != 0) return compared;
        }
        return Integer.compare(leftBytes.length, rightBytes.length);
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("SHA-256 is unavailable.", exception);
        }
    }

    record Input(String kind, String path, String mediaType) {
    }

    record Entry(String kind, String path, String mediaType, long byteLength, String sha256) {
        Map<String, Object> asMap() {
            return Map.of("kind", kind, "path", path, "media_type", mediaType, "byte_length", byteLength, "sha256", sha256);
        }
    }

    record Result(Path assetPath, Path inputPath, String inputRawSha256, String inputPayloadSha256) {
    }
}
