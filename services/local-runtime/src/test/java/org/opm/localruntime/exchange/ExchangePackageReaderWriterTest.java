package org.opm.localruntime.exchange;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExchangePackageReaderWriterTest {

    @TempDir
    Path temporary;

    @Test
    void writesAndReadsCanonicalModelRevisionWithoutBusinessWrites() throws Exception {
        Path target = temporary.resolve("revision.opmp");
        ExchangePackageManifest manifest = new ExchangePackageWriter().writeModelRevision(target, input());

        assertTrue(Files.isRegularFile(target));
        assertEquals("MODEL_REVISION", manifest.packageKind());
        assertEquals("model.demo.processing", new ExchangePackageReader().readModelRevision(target).revision().modelId());
        try (ZipFile zip = new ZipFile(target.toFile())) {
            assertEquals("manifest.json", zip.entries().nextElement().getName());
            assertEquals(4, java.util.Collections.list(zip.entries()).size());
        }
        assertEquals(1, Files.list(temporary).count());
        assertFalse(Files.walk(temporary).anyMatch(path -> path.getFileName().toString().endsWith(".db")));
    }

    @Test
    void rejectsTamperedEntryAndUnsafeUnknownPhysicalPath() throws Exception {
        Path packageFile = writePackage();
        rewrite(packageFile, entries -> entries.put("model/model.json", "{}".getBytes(StandardCharsets.UTF_8)));
        assertCode("EXCHANGE_ENTRY_DIGEST_MISMATCH", () -> new ExchangePackageReader().inspect(packageFile));

        Path unsafe = writePackage();
        rewrite(unsafe, entries -> entries.put("../unsafe.json", "{}".getBytes(StandardCharsets.UTF_8)));
        assertCode("EXCHANGE_IO_SECURITY_REJECTED", () -> new ExchangePackageReader().inspect(unsafe));
    }

    @Test
    void rejectsNonCanonicalManifestAndRatioLimit() throws Exception {
        Path packageFile = writePackage();
        rewrite(packageFile, entries -> entries.put("manifest.json", "{ \"schema_id\": \"bad\" }".getBytes(StandardCharsets.UTF_8)));
        assertCode("EXCHANGE_MANIFEST_INVALID", () -> new ExchangePackageReader().inspect(packageFile));

        Path oversized = temporary.resolve("oversized.opmp");
        byte[] payload = new byte[1024 * 1024];
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(oversized))) {
            zip.putNextEntry(new ZipEntry("manifest.json")); zip.write(payload); zip.closeEntry();
        }
        assertCode("EXCHANGE_IO_SECURITY_REJECTED", () -> new ExchangePackageReader().inspect(oversized));
    }

    @Test
    void rejectsZipSymbolicLinkAttribute() throws Exception {
        Path packageFile = writePackage();
        byte[] raw = Files.readAllBytes(packageFile);
        for (int index = 0; index <= raw.length - 46; index++) {
            if (raw[index] == 0x50 && raw[index + 1] == 0x4b && raw[index + 2] == 0x01 && raw[index + 3] == 0x02) {
                raw[index + 38] = 0; raw[index + 39] = 0; raw[index + 40] = (byte) 0xff; raw[index + 41] = (byte) 0xa1;
                Files.write(packageFile, raw);
                assertCode("EXCHANGE_IO_SECURITY_REJECTED", () -> new ExchangePackageReader().inspect(packageFile));
                return;
            }
        }
        throw new IllegalStateException("ZIP central directory was not found");
    }

    @Test
    void rejectsDuplicateZipPhysicalEntry() throws Exception {
        Path packageFile = writePackage();
        byte[] raw = Files.readAllBytes(packageFile);
        int eocd = findEocd(raw);
        int centralOffset = unsignedInt(raw, eocd + 16);
        int centralSize = unsignedInt(raw, eocd + 12);
        int firstLength = 46 + unsignedShort(raw, centralOffset + 28) + unsignedShort(raw, centralOffset + 30) + unsignedShort(raw, centralOffset + 32);
        byte[] duplicate = new byte[raw.length + firstLength];
        int insert = centralOffset + centralSize;
        System.arraycopy(raw, 0, duplicate, 0, insert);
        System.arraycopy(raw, centralOffset, duplicate, insert, firstLength);
        System.arraycopy(raw, insert, duplicate, insert + firstLength, raw.length - insert);
        int shiftedEocd = eocd + firstLength;
        writeShort(duplicate, shiftedEocd + 8, unsignedShort(raw, eocd + 8) + 1);
        writeShort(duplicate, shiftedEocd + 10, unsignedShort(raw, eocd + 10) + 1);
        writeInt(duplicate, shiftedEocd + 12, centralSize + firstLength);
        Files.write(packageFile, duplicate);
        assertCode("EXCHANGE_IO_SECURITY_REJECTED", () -> new ExchangePackageReader().inspect(packageFile));
    }

    @Test
    void rejectsRequiredExtensionAndUnsupportedAdapter() throws Exception {
        Path packageFile = writePackage();
        ExchangePackageInspection inspection = new ExchangePackageReader().inspect(packageFile);
        ExchangePackageManifest base = inspection.manifest();
        ExchangePackageManifest unsigned = new ExchangePackageManifest(base.packageId(), base.packageKind(), base.createdAt(), base.producerApplication(), base.identityNamespace(), base.source(), base.entries(),
                java.util.List.of(new ExchangePackageManifest.Extension("urn:opm:test", "1.0", true)), null);
        ExchangePackageManifest withRequiredExtension = new ExchangePackageManifest(base.packageId(), base.packageKind(), base.createdAt(), base.producerApplication(), base.identityNamespace(), base.source(), base.entries(),
                java.util.List.of(new ExchangePackageManifest.Extension("urn:opm:test", "1.0", true)), unsigned.computedDigest());
        rewrite(packageFile, entries -> entries.put("manifest.json", withRequiredExtension.canonicalBytes()));
        assertCode("EXCHANGE_REQUIRED_EXTENSION_UNSUPPORTED", () -> new ExchangePackageReader().inspect(packageFile));

        Path projectPackage = temporary.resolve("project.opmp");
        ExchangePackageManifest project = projectManifest();
        writeZip(projectPackage, Map.of("manifest.json", project.canonicalBytes(), "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
        assertCode("EXCHANGE_ADAPTER_UNAVAILABLE", () -> new ExchangePackageReader().readModelRevision(projectPackage));
    }

    @Test
    void rejectsCyclicDependenciesAndUnsupportedFormat() throws Exception {
        Path packageFile = writePackage();
        ExchangePackageInspection inspection = new ExchangePackageReader().inspect(packageFile);
        ExchangePackageManifest base = inspection.manifest();
        List<ExchangePackageManifest.Entry> cyclic = base.entries().stream().map(entry -> "MODEL_CATALOG".equals(entry.entryRole())
                ? new ExchangePackageManifest.Entry(entry.entryId(), entry.entryRole(), entry.logicalPath(), entry.mediaType(), entry.schemaReference(), entry.required(), entry.byteLength(), entry.sha256(), List.of("CAPABILITY_REPORT"))
                : entry).toList();
        rewrite(packageFile, entries -> entries.put("manifest.json", manifest(base, cyclic, base.extensions()).canonicalBytes()));
        assertCode("EXCHANGE_REFERENCE_INVALID", () -> new ExchangePackageReader().inspect(packageFile));

        Path unsupported = writePackage();
        rewrite(unsupported, entries -> entries.put("manifest.json", unsupportedFormat(entries.get("manifest.json"))));
        assertCode("EXCHANGE_FORMAT_UNSUPPORTED", () -> new ExchangePackageReader().inspect(unsupported));
    }

    @Test
    void refusesCatalogThatDoesNotMatchTheRevision() {
        ExchangeModelRevisionInput mismatched = new ExchangeModelRevisionInput("exchange-002", Instant.parse("2026-09-01T00:00:00Z"), "opm", "0.1", "urn:opm:runtime",
                "{\"model_id\":\"other-model\"}".getBytes(StandardCharsets.UTF_8), revision(), "{\"status\":\"EVIDENCE_MISSING\"}".getBytes(StandardCharsets.UTF_8));
        assertCode("EXCHANGE_SEMANTIC_REVISION_INVALID", () -> new ExchangePackageWriter().writeModelRevision(temporary.resolve("mismatched.opmp"), mismatched));
        assertFalse(Files.exists(temporary.resolve("mismatched.opmp")));
    }

    private Path writePackage() {
        Path target = temporary.resolve("package-" + java.util.UUID.randomUUID() + ".opmp");
        new ExchangePackageWriter().writeModelRevision(target, input());
        return target;
    }

    private ExchangeModelRevisionInput input() {
        return new ExchangeModelRevisionInput("exchange-001", Instant.parse("2026-09-01T00:00:00Z"), "opm-local-runtime", "0.1.0", "urn:opm:runtime",
                "{\"model_id\":\"model.demo.processing\"}".getBytes(StandardCharsets.UTF_8), revision(), "{\"status\":\"EVIDENCE_MISSING\"}".getBytes(StandardCharsets.UTF_8));
    }

    private byte[] revision() {
        try {
            return Files.readAllBytes(repositoryFile("docs/contracts/examples/minimal-iso-revision.json"));
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ExchangePackageManifest projectManifest() {
        byte[] project = "{}".getBytes(StandardCharsets.UTF_8);
        ExchangePackageManifest.Entry entry = new ExchangePackageManifest.Entry("PROJECT_CATALOG", "PROJECT_CATALOG", "project/project.json", "application/json",
                new ExchangePackageManifest.SchemaReference("OPM-PROJECT-001", "1.0"), true, project.length, sha256(project), java.util.List.of());
        ExchangePackageManifest unsigned = new ExchangePackageManifest("project-001", "PROJECT_FULL", "2026-09-01T00:00:00Z", new ExchangePackageManifest.Producer("opm", "0.1"), "urn:opm:runtime",
                new ExchangePackageManifest.Source("project-001", null, null, null), java.util.List.of(entry), java.util.List.of(), null);
        return new ExchangePackageManifest(unsigned.packageId(), unsigned.packageKind(), unsigned.createdAt(), unsigned.producerApplication(), unsigned.identityNamespace(), unsigned.source(), unsigned.entries(), unsigned.extensions(), unsigned.computedDigest());
    }

    private ExchangePackageManifest manifest(ExchangePackageManifest base, List<ExchangePackageManifest.Entry> entries, List<ExchangePackageManifest.Extension> extensions) {
        ExchangePackageManifest unsigned = new ExchangePackageManifest(base.packageId(), base.packageKind(), base.createdAt(), base.producerApplication(), base.identityNamespace(), base.source(), entries, extensions, null);
        return new ExchangePackageManifest(unsigned.packageId(), unsigned.packageKind(), unsigned.createdAt(), unsigned.producerApplication(), unsigned.identityNamespace(), unsigned.source(), unsigned.entries(), unsigned.extensions(), unsigned.computedDigest());
    }

    private byte[] unsupportedFormat(byte[] raw) {
        try {
            ObjectNode manifest = (ObjectNode) new ObjectMapper().readTree(raw);
            manifest.put("exchange_format_version", "2.0");
            manifest.remove("package_digest");
            manifest.put("package_digest", Rfc8785JsonCanonicalizer.sha256(manifest));
            return Rfc8785JsonCanonicalizer.canonicalize(manifest).getBytes(StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private int findEocd(byte[] raw) {
        for (int index = raw.length - 22; index >= Math.max(0, raw.length - 65557); index--) if (unsignedInt(raw, index) == 0x06054b50) return index;
        throw new IllegalStateException("ZIP end-of-central-directory was not found");
    }

    private int unsignedShort(byte[] raw, int offset) { return Byte.toUnsignedInt(raw[offset]) | (Byte.toUnsignedInt(raw[offset + 1]) << 8); }
    private int unsignedInt(byte[] raw, int offset) { return Byte.toUnsignedInt(raw[offset]) | (Byte.toUnsignedInt(raw[offset + 1]) << 8) | (Byte.toUnsignedInt(raw[offset + 2]) << 16) | (Byte.toUnsignedInt(raw[offset + 3]) << 24); }
    private void writeShort(byte[] raw, int offset, int value) { raw[offset] = (byte) value; raw[offset + 1] = (byte) (value >>> 8); }
    private void writeInt(byte[] raw, int offset, int value) { raw[offset] = (byte) value; raw[offset + 1] = (byte) (value >>> 8); raw[offset + 2] = (byte) (value >>> 16); raw[offset + 3] = (byte) (value >>> 24); }

    private void rewrite(Path packageFile, java.util.function.Consumer<Map<String, byte[]>> change) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipFile zip = new ZipFile(packageFile.toFile())) {
            for (ZipEntry entry : java.util.Collections.list(zip.entries())) entries.put(entry.getName(), zip.getInputStream(entry).readAllBytes());
        }
        change.accept(entries);
        writeZip(packageFile, entries);
    }

    private void writeZip(Path target, Map<String, byte[]> entries) throws IOException {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(target))) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
    }

    private void assertCode(String code, Runnable action) {
        assertEquals(code, assertThrows(ExchangeException.class, action::run).code());
    }

    private String sha256(byte[] raw) {
        try { return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw)); }
        catch (Exception exception) { throw new IllegalStateException(exception); }
    }

    private Path repositoryFile(String relative) {
        Path current = Path.of("").toAbsolutePath();
        while (current != null) { Path candidate = current.resolve(relative); if (Files.isRegularFile(candidate)) return candidate; current = current.getParent(); }
        throw new IllegalStateException("Missing fixture: " + relative);
    }
}
