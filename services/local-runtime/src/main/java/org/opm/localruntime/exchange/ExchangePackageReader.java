package org.opm.localruntime.exchange;

import org.opm.localruntime.semantic.RevisionDocumentEnvelope;
import org.opm.localruntime.semantic.RevisionDocumentReaderRouter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** `.opmp` ZIP 的低层安全 Reader 与 MODEL_REVISION 内存适配。 */
public final class ExchangePackageReader {

    private static final int MAX_ENTRIES = 64;
    private static final int MAX_ENTRY_BYTES = 16 * 1024 * 1024;
    private static final int MAX_TOTAL_BYTES = 64 * 1024 * 1024;
    private static final int MAX_MANIFEST_BYTES = 1024 * 1024;
    private static final int MAX_RATIO = 100;
    private final RevisionDocumentReaderRouter revisionReader = new RevisionDocumentReaderRouter();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ExchangePackageInspection inspect(Path source) {
        if (source == null || !Files.isRegularFile(source)) throw security("Exchange package must be a regular file.");
        try (ZipFile zip = new ZipFile(source.toFile())) {
            assertNoSymbolicLinkEntry(source);
            List<? extends ZipEntry> physical = java.util.Collections.list(zip.entries());
            if (physical.isEmpty() || physical.size() > MAX_ENTRIES) throw security("ZIP entry count exceeds the limit.");
            Set<String> names = new HashSet<>();
            for (ZipEntry entry : physical) {
                validatePhysicalEntry(entry, names);
            }
            ZipEntry manifestEntry = zip.getEntry("manifest.json");
            if (manifestEntry == null) throw manifest("manifest.json is missing.");
            byte[] manifestRaw = readLimited(zip, manifestEntry, MAX_MANIFEST_BYTES, MAX_MANIFEST_BYTES);
            ExchangePackageManifest manifest = ExchangePackageManifest.parse(manifestRaw);
            rejectRequiredExtensions(manifest.extensions());
            validateManifestEntries(manifest, names);
            Map<String, byte[]> entries = new LinkedHashMap<>();
            int total = manifestRaw.length;
            for (ExchangePackageManifest.Entry entry : manifest.entries()) {
                ZipEntry physicalEntry = zip.getEntry(entry.logicalPath());
                byte[] raw = readLimited(zip, physicalEntry, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES - total);
                total += raw.length;
                if (raw.length != entry.byteLength() || !sha256(raw).equals(entry.sha256())) {
                    throw new ExchangeException("EXCHANGE_ENTRY_DIGEST_MISMATCH", "Entry digest or length differs: " + entry.logicalPath());
                }
                if (isJson(entry.mediaType())) {
                    byte[] canonical = ExchangeJsonCanonicalizer.canonicalize(raw);
                    if (!java.util.Arrays.equals(raw, canonical)) throw manifest("JSON entry is not canonical: " + entry.logicalPath());
                }
                entries.put(entry.logicalPath(), raw);
            }
            return new ExchangePackageInspection(manifest, entries);
        } catch (ExchangeException exception) {
            throw exception;
        } catch (IOException exception) {
            throw security("ZIP package cannot be read.", exception);
        }
    }

    public RevisionDocumentEnvelope readModelRevision(Path source) {
        ExchangePackageInspection inspection = inspect(source);
        ExchangePackageManifest manifest = inspection.manifest();
        if (!"MODEL_REVISION".equals(manifest.packageKind())) {
            throw new ExchangeException("EXCHANGE_ADAPTER_UNAVAILABLE", "Only MODEL_REVISION has a first-release adapter.");
        }
        ExchangePackageManifest.Entry revisionEntry = manifest.entries().stream().filter(entry -> "SEMANTIC_REVISION".equals(entry.entryRole())).findFirst()
                .orElseThrow(() -> new ExchangeException("EXCHANGE_REFERENCE_INVALID", "Semantic revision entry is missing."));
        try {
            RevisionDocumentEnvelope envelope = revisionReader.read(inspection.entry(revisionEntry.logicalPath()));
            ExchangePackageManifest.Entry catalogEntry = manifest.entries().stream().filter(entry -> "MODEL_CATALOG".equals(entry.entryRole())).findFirst()
                    .orElseThrow(() -> new ExchangeException("EXCHANGE_REFERENCE_INVALID", "Model catalog entry is missing."));
            JsonNode catalog = objectMapper.readTree(inspection.entry(catalogEntry.logicalPath()));
            if (!manifest.source().modelId().equals(envelope.revision().modelId()) || !manifest.source().revisionId().equals(envelope.revision().revisionId())
                    || !revisionEntry.schemaReference().schemaId().equals(envelope.schemaId()) || !revisionEntry.schemaReference().schemaVersion().equals(envelope.schemaVersion())
                    || catalog == null || !catalog.isObject() || !manifest.source().modelId().equals(catalog.path("model_id").asText())) {
                throw new ExchangeException("EXCHANGE_SEMANTIC_REVISION_INVALID", "Revision identity or schema differs from Manifest.");
            }
            return envelope;
        } catch (ExchangeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExchangeException("EXCHANGE_SEMANTIC_REVISION_INVALID", "Semantic revision cannot be read.", exception);
        }
    }

    private void validatePhysicalEntry(ZipEntry entry, Set<String> names) {
        String name = entry.getName();
        if (entry.isDirectory() || !safePath(name) || !names.add(name)) throw security("ZIP physical entry is unsafe or duplicated.");
        long size = entry.getSize(); long compressed = entry.getCompressedSize();
        if (size < 0 || compressed < 0 || size > MAX_ENTRY_BYTES || (size > 0 && (compressed == 0 || size > compressed * MAX_RATIO))) {
            throw security("ZIP entry exceeds configured size or ratio limit.");
        }
    }

    private void assertNoSymbolicLinkEntry(Path source) throws IOException {
        long fileSize = Files.size(source);
        if (fileSize < 22 || fileSize > MAX_TOTAL_BYTES + MAX_ENTRIES * 1024L) throw security("ZIP physical size is outside the configured limit.");
        byte[] raw = Files.readAllBytes(source);
        int eocd = findEndOfCentralDirectory(raw);
        if (eocd < 0 || unsignedInt(raw, eocd + 12) == 0xffff_ffffL || unsignedInt(raw, eocd + 16) == 0xffff_ffffL) throw security("ZIP64 and malformed ZIP archives are not supported.");
        int position = Math.toIntExact(unsignedInt(raw, eocd + 16));
        int end = Math.toIntExact(unsignedInt(raw, eocd + 12) + position);
        if (position < 0 || end > eocd) throw security("ZIP central directory is invalid.");
        while (position < end) {
            if (unsignedInt(raw, position) != 0x02014b50L || position + 46 > end) throw security("ZIP central directory is invalid.");
            long externalAttributes = unsignedInt(raw, position + 38);
            if (((externalAttributes >>> 16) & 0xf000L) == 0xa000L) throw security("ZIP symbolic-link entries are forbidden.");
            int nameLength = unsignedShort(raw, position + 28);
            int extraLength = unsignedShort(raw, position + 30);
            int commentLength = unsignedShort(raw, position + 32);
            position += 46 + nameLength + extraLength + commentLength;
        }
        if (position != end) throw security("ZIP central directory is invalid.");
    }

    private int findEndOfCentralDirectory(byte[] raw) {
        int first = Math.max(0, raw.length - 65557);
        for (int index = raw.length - 22; index >= first; index--) if (unsignedInt(raw, index) == 0x06054b50L) return index;
        return -1;
    }

    private int unsignedShort(byte[] raw, int offset) { return Byte.toUnsignedInt(raw[offset]) | (Byte.toUnsignedInt(raw[offset + 1]) << 8); }
    private long unsignedInt(byte[] raw, int offset) { return Integer.toUnsignedLong(Byte.toUnsignedInt(raw[offset]) | (Byte.toUnsignedInt(raw[offset + 1]) << 8) | (Byte.toUnsignedInt(raw[offset + 2]) << 16) | (Byte.toUnsignedInt(raw[offset + 3]) << 24)); }

    private void validateManifestEntries(ExchangePackageManifest manifest, Set<String> names) {
        Set<String> declared = new HashSet<>(); declared.add("manifest.json");
        Map<String, ExchangePackageManifest.Entry> byId = new HashMap<>();
        for (ExchangePackageManifest.Entry entry : manifest.entries()) { declared.add(entry.logicalPath()); byId.put(entry.entryId(), entry); }
        if (!declared.equals(names)) throw security("ZIP contains unknown or missing entries.");
        for (ExchangePackageManifest.Entry entry : manifest.entries()) {
            for (String dependency : entry.dependsOn()) {
                if (!byId.containsKey(dependency) || dependency.equals(entry.entryId())) throw new ExchangeException("EXCHANGE_REFERENCE_INVALID", "Entry dependency is invalid.");
            }
        }
        assertAcyclic(byId);
        if ("MODEL_REVISION".equals(manifest.packageKind())) {
            if (manifest.entries().size() != 3 || !hasModelRevisionShape(manifest.entries(), manifest.source().revisionId())) {
                throw new ExchangeException("EXCHANGE_REFERENCE_INVALID", "MODEL_REVISION entry shape is invalid.");
            }
        }
    }

    private boolean hasModelRevisionShape(List<ExchangePackageManifest.Entry> entries, String revisionId) {
        return entries.stream().anyMatch(entry -> "MODEL_CATALOG".equals(entry.entryRole()) && entry.required() && "model/model.json".equals(entry.logicalPath()))
                && entries.stream().anyMatch(entry -> "SEMANTIC_REVISION".equals(entry.entryRole()) && entry.required() && ("revisions/" + revisionId + ".json").equals(entry.logicalPath()))
                && entries.stream().anyMatch(entry -> "CAPABILITY_REPORT".equals(entry.entryRole()) && entry.required() && "evidence/capability-report.json".equals(entry.logicalPath()));
    }

    private void assertAcyclic(Map<String, ExchangePackageManifest.Entry> byId) {
        Set<String> complete = new HashSet<>(); Set<String> active = new HashSet<>();
        for (String id : byId.keySet()) visit(id, byId, complete, active);
    }

    private void visit(String id, Map<String, ExchangePackageManifest.Entry> byId, Set<String> complete, Set<String> active) {
        if (complete.contains(id)) return;
        if (!active.add(id)) throw new ExchangeException("EXCHANGE_REFERENCE_INVALID", "Entry dependencies contain a cycle.");
        for (String dependency : byId.get(id).dependsOn()) visit(dependency, byId, complete, active);
        active.remove(id); complete.add(id);
    }

    private byte[] readLimited(ZipFile zip, ZipEntry entry, int entryLimit, int remainingTotal) throws IOException {
        if (entry == null || entryLimit < 1 || remainingTotal < 1) throw security("ZIP byte limit is exceeded.");
        try (InputStream input = zip.getInputStream(entry); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int total = 0; int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > entryLimit || total > remainingTotal) throw security("ZIP decompressed byte limit is exceeded.");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private void rejectRequiredExtensions(List<ExchangePackageManifest.Extension> extensions) {
        if (extensions.stream().anyMatch(ExchangePackageManifest.Extension::required)) {
            throw new ExchangeException("EXCHANGE_REQUIRED_EXTENSION_UNSUPPORTED", "Required extensions are not supported by EXCHANGE-01.");
        }
    }

    private boolean isJson(String mediaType) { return "application/json".equals(mediaType) || mediaType.endsWith("+json"); }
    private boolean safePath(String path) { if (path == null || path.isBlank() || path.startsWith("/") || path.endsWith("/") || path.contains("\\") || path.indexOf('\u0000') >= 0) return false; for (String segment : path.split("/")) if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) return false; return true; }
    private String sha256(byte[] raw) { try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); } catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); } }
    private ExchangeException security(String message) { return new ExchangeException("EXCHANGE_IO_SECURITY_REJECTED", message); }
    private ExchangeException security(String message, Throwable cause) { return new ExchangeException("EXCHANGE_IO_SECURITY_REJECTED", message, cause); }
    private ExchangeException manifest(String message) { return new ExchangeException("EXCHANGE_MANIFEST_INVALID", message); }
}
