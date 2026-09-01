package org.opm.localruntime.exchange;

import org.opm.localruntime.semantic.RevisionDocumentEnvelope;
import org.opm.localruntime.semantic.RevisionDocumentReaderRouter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** `.opmp` 首发 MODEL_REVISION Writer。 */
public final class ExchangePackageWriter {

    private static final String MANIFEST_PATH = "manifest.json";
    private final RevisionDocumentReaderRouter revisionReader = new RevisionDocumentReaderRouter();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ExchangePackageManifest writeModelRevision(Path target, ExchangeModelRevisionInput input) {
        if (target == null || target.getFileName() == null || !target.getFileName().toString().endsWith(".opmp")) {
            throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "Target must use the .opmp extension.");
        }
        if (Files.exists(target)) throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "Target already exists.");
        Path parent = target.toAbsolutePath().normalize().getParent();
        if (parent == null || !Files.isDirectory(parent)) throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "Target parent must exist.");
        try {
            byte[] model = ExchangeJsonCanonicalizer.canonicalize(input.modelCatalogJson());
            byte[] revision = ExchangeJsonCanonicalizer.canonicalize(input.revisionJson());
            byte[] capability = ExchangeJsonCanonicalizer.canonicalize(input.capabilityReportJson());
            RevisionDocumentEnvelope envelope = revisionReader.read(revision);
            assertCatalogModelId(model, envelope.revision().modelId());
            Map<String, byte[]> content = new LinkedHashMap<>();
            content.put("model/model.json", model);
            content.put("revisions/" + envelope.revision().revisionId() + ".json", revision);
            content.put("evidence/capability-report.json", capability);
            List<ExchangePackageManifest.Entry> entries = List.of(
                    entry("CAPABILITY_REPORT", "CAPABILITY_REPORT", "evidence/capability-report.json", capability, List.of("SEMANTIC_REVISION")),
                    entry("MODEL_CATALOG", "MODEL_CATALOG", "model/model.json", model, List.of()),
                    entry("SEMANTIC_REVISION", "SEMANTIC_REVISION", "revisions/" + envelope.revision().revisionId() + ".json", revision, List.of("MODEL_CATALOG"), envelope.schemaVersion()));
            ExchangePackageManifest unsigned = ExchangePackageManifest.modelRevision(input, envelope.revision().modelId(), envelope.revision().revisionId(), entries, null);
            ExchangePackageManifest manifest = ExchangePackageManifest.modelRevision(input, envelope.revision().modelId(), envelope.revision().revisionId(), entries, unsigned.computedDigest());
            writeAtomically(target.toAbsolutePath().normalize(), manifest.canonicalBytes(), content);
            return manifest;
        } catch (ExchangeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "Cannot write native exchange package.", exception);
        }
    }

    private void assertCatalogModelId(byte[] catalog, String modelId) {
        try {
            JsonNode root = objectMapper.readTree(catalog);
            if (root == null || !root.isObject() || !modelId.equals(root.path("model_id").asText())) {
                throw new ExchangeException("EXCHANGE_SEMANTIC_REVISION_INVALID", "MODEL_CATALOG.model_id differs from semantic revision.");
            }
        } catch (ExchangeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExchangeException("EXCHANGE_SEMANTIC_REVISION_INVALID", "MODEL_CATALOG cannot be read.", exception);
        }
    }

    private ExchangePackageManifest.Entry entry(String id, String role, String path, byte[] raw, List<String> dependsOn) {
        return entry(id, role, path, raw, dependsOn, "1.0");
    }

    private ExchangePackageManifest.Entry entry(String id, String role, String path, byte[] raw, List<String> dependsOn, String schemaVersion) {
        return new ExchangePackageManifest.Entry(id, role, path, "application/json",
                new ExchangePackageManifest.SchemaReference(role.equals("SEMANTIC_REVISION") ? "MS-REV-001" : "OPM-EXCHANGE-OPAQUE-JSON", schemaVersion),
                true, raw.length, sha256(raw), dependsOn);
    }

    private void writeAtomically(Path target, byte[] manifest, Map<String, byte[]> content) throws IOException {
        Path temporary = Files.createTempFile(target.getParent(), target.getFileName().toString() + ".", ".tmp");
        try {
            try (OutputStream output = Files.newOutputStream(temporary, StandardOpenOption.TRUNCATE_EXISTING);
                 ZipOutputStream zip = new ZipOutputStream(output)) {
                write(zip, MANIFEST_PATH, manifest);
                for (Map.Entry<String, byte[]> entry : content.entrySet().stream().sorted(Map.Entry.comparingByKey(Comparator.naturalOrder())).toList()) {
                    write(zip, entry.getKey(), entry.getValue());
                }
            }
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) { channel.force(true); }
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException exception) {
                throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "Target filesystem does not support atomic rename.", exception);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private void write(ZipOutputStream zip, String path, byte[] raw) throws IOException {
        ZipEntry entry = new ZipEntry(path);
        entry.setTime(0L);
        zip.putNextEntry(entry);
        zip.write(raw);
        zip.closeEntry();
    }

    private String sha256(byte[] raw) {
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); }
        catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }
}
