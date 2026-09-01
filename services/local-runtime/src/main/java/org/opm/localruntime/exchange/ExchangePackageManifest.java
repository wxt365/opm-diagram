package org.opm.localruntime.exchange;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** `.opmp` 1.0 Manifest 的受控内存表示。 */
public record ExchangePackageManifest(
        String packageId,
        String packageKind,
        String createdAt,
        Producer producerApplication,
        String identityNamespace,
        Source source,
        List<Entry> entries,
        List<Extension> extensions,
        String packageDigest) {

    static final String SCHEMA_ID = "OPM-NATIVE-EXCHANGE-001";
    static final String VERSION = "1.0";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Set<String> ENTRY_ROLES = Set.of("MODEL_CATALOG", "SEMANTIC_REVISION", "CAPABILITY_REPORT", "PROJECT_CATALOG", "BASELINE", "PROFILE", "RULE", "GRAMMAR", "TEXT", "TRACE", "VALIDATION", "ASSET", "EXTENSION");

    public ExchangePackageManifest {
        packageId = required(packageId, "packageId");
        packageKind = required(packageKind, "packageKind");
        createdAt = required(createdAt, "createdAt");
        producerApplication = Objects.requireNonNull(producerApplication, "producerApplication must not be null");
        identityNamespace = required(identityNamespace, "identityNamespace");
        source = Objects.requireNonNull(source, "source must not be null");
        entries = List.copyOf(entries);
        extensions = List.copyOf(extensions);
        packageDigest = packageDigest == null ? null : digest(packageDigest);
    }

    static ExchangePackageManifest modelRevision(ExchangeModelRevisionInput input, String modelId, String revisionId, List<Entry> entries, String digest) {
        return new ExchangePackageManifest(input.packageId(), "MODEL_REVISION",
                DateTimeFormatter.ISO_INSTANT.format(input.createdAt()),
                new Producer(input.producerApplicationId(), input.producerVersion()), input.identityNamespace(),
                new Source(null, modelId, revisionId, null), entries, List.of(), digest);
    }

    byte[] canonicalBytes() {
        return Rfc8785JsonCanonicalizer.canonicalize(json(true)).getBytes(StandardCharsets.UTF_8);
    }

    String computedDigest() {
        return Rfc8785JsonCanonicalizer.sha256(json(false));
    }

    private Map<String, Object> json(boolean includeDigest) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema_id", SCHEMA_ID); result.put("schema_version", VERSION); result.put("package_id", packageId);
        result.put("package_kind", packageKind); result.put("exchange_format_version", VERSION); result.put("minimum_reader_version", VERSION);
        result.put("created_at", createdAt); result.put("producer_application", producerApplication.json()); result.put("identity_namespace", identityNamespace);
        result.put("source", source.json());
        result.put("entries", entries.stream().sorted(Comparator.comparing(Entry::entryId)).map(Entry::json).toList());
        result.put("extensions", extensions.stream().sorted(Comparator.comparing(Extension::extensionId)).map(Extension::json).toList());
        if (includeDigest) result.put("package_digest", packageDigest);
        return result;
    }

    static ExchangePackageManifest parse(byte[] raw) {
        try {
            if (raw.length == 0 || (raw.length >= 3 && raw[0] == (byte) 0xef && raw[1] == (byte) 0xbb && raw[2] == (byte) 0xbf)) {
                throw invalid("Manifest must be non-empty UTF-8 without BOM.");
            }
            JsonNode node = OBJECT_MAPPER.readTree(raw);
            if (node == null || !node.isObject()) throw invalid("Manifest must be an object.");
            byte[] canonical = Rfc8785JsonCanonicalizer.canonicalize(node).getBytes(StandardCharsets.UTF_8);
            if (!java.util.Arrays.equals(raw, canonical)) throw invalid("Manifest must be RFC 8785 canonical JSON.");
            return fromNode((ObjectNode) node);
        } catch (ExchangeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "Manifest is invalid.", exception);
        }
    }

    private static ExchangePackageManifest fromNode(ObjectNode node) {
        exactFields(node, List.of("schema_id", "schema_version", "package_id", "package_kind", "exchange_format_version", "minimum_reader_version", "created_at", "producer_application", "identity_namespace", "source", "entries", "extensions", "package_digest"), "manifest");
        exact(node, "schema_id", SCHEMA_ID); exact(node, "schema_version", VERSION);
        if (!VERSION.equals(text(node, "exchange_format_version")) || !VERSION.equals(text(node, "minimum_reader_version"))) {
            throw new ExchangeException("EXCHANGE_FORMAT_UNSUPPORTED", "Exchange format version is unsupported.");
        }
        String kind = text(node, "package_kind");
        if (!List.of("PROJECT_FULL", "MODEL_REVISION", "BASELINE_ASSET").contains(kind)) throw invalid("Unsupported package_kind.");
        String createdAt = text(node, "created_at");
        try { Instant.parse(createdAt); } catch (Exception exception) { throw invalid("created_at must be UTC ISO instant."); }
        if (!createdAt.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) throw invalid("created_at must have whole UTC seconds.");
        ObjectNode producer = object(node, "producer_application"); exactFields(producer, List.of("application_id", "version"), "producer_application");
        ObjectNode source = object(node, "source"); exactFields(source, List.of("project_id", "model_id", "revision_id", "baseline_id"), "source");
        Source parsedSource = new Source(nullableText(source, "project_id"), nullableText(source, "model_id"), nullableText(source, "revision_id"), nullableText(source, "baseline_id"));
        validateSource(kind, parsedSource);
        List<Entry> entries = entries(node.required("entries"));
        List<Extension> extensions = extensions(node.required("extensions"));
        ExchangePackageManifest manifest = new ExchangePackageManifest(text(node, "package_id"), kind, createdAt,
                new Producer(text(producer, "application_id"), text(producer, "version")), text(node, "identity_namespace"), parsedSource, entries, extensions, text(node, "package_digest"));
        if (!manifest.packageDigest.equals(manifest.computedDigest())) throw new ExchangeException("EXCHANGE_PACKAGE_DIGEST_MISMATCH", "Manifest package_digest differs from canonical preimage.");
        return manifest;
    }

    private static List<Entry> entries(JsonNode node) {
        if (!node.isArray() || node.isEmpty() || node.size() > 64) throw invalid("entries must contain 1..64 values.");
        List<Entry> result = new ArrayList<>();
        for (JsonNode value : node) {
            if (!value.isObject()) throw invalid("entry must be an object.");
            ObjectNode entry = (ObjectNode) value;
            exactFields(entry, List.of("entry_id", "entry_role", "logical_path", "media_type", "schema_ref", "required", "byte_length", "sha256", "depends_on"), "entry");
            ObjectNode schema = object(entry, "schema_ref"); exactFields(schema, List.of("schema_id", "schema_version"), "entry.schema_ref");
            JsonNode required = entry.get("required"); JsonNode length = entry.get("byte_length"); JsonNode dependencies = entry.get("depends_on");
            if (required == null || !required.isBoolean() || length == null || !length.canConvertToInt() || !length.isIntegralNumber() || length.intValue() < 1 || length.intValue() > 16 * 1024 * 1024 || dependencies == null || !dependencies.isArray() || dependencies.size() > 32) throw invalid("Entry field shape is invalid.");
            List<String> dependsOn = new ArrayList<>();
            for (JsonNode dependency : dependencies) dependsOn.add(text(dependency, "entry.depends_on"));
            assertUnique(dependsOn, "entry depends_on"); assertSorted(dependsOn, "entry depends_on");
            String entryRole = text(entry, "entry_role");
            if (!ENTRY_ROLES.contains(entryRole)) throw invalid("entry_role is unsupported.");
            result.add(new Entry(text(entry, "entry_id"), entryRole, safePath(text(entry, "logical_path")), text(entry, "media_type"),
                    new SchemaReference(text(schema, "schema_id"), text(schema, "schema_version")), required.booleanValue(), length.intValue(), digest(text(entry, "sha256")), dependsOn));
        }
        assertUnique(result.stream().map(Entry::entryId).toList(), "entry_id");
        assertUnique(result.stream().map(Entry::logicalPath).toList(), "logical_path");
        List<String> ids = result.stream().map(Entry::entryId).toList(); assertSorted(ids, "entries");
        return result;
    }

    private static List<Extension> extensions(JsonNode node) {
        if (!node.isArray() || node.size() > 32) throw invalid("extensions must contain at most 32 values.");
        List<Extension> result = new ArrayList<>();
        for (JsonNode value : node) {
            if (!value.isObject()) throw invalid("extension must be an object."); ObjectNode extension = (ObjectNode) value;
            exactFields(extension, List.of("extension_id", "version", "required"), "extension");
            if (!extension.required("required").isBoolean()) throw invalid("extension.required must be boolean.");
            result.add(new Extension(text(extension, "extension_id"), text(extension, "version"), extension.required("required").booleanValue()));
        }
        assertUnique(result.stream().map(Extension::extensionId).toList(), "extension_id");
        assertSorted(result.stream().map(Extension::extensionId).toList(), "extensions");
        return result;
    }

    private static void validateSource(String kind, Source source) {
        if ("MODEL_REVISION".equals(kind) && (source.projectId != null || source.modelId == null || source.revisionId == null || source.baselineId != null)) throw invalid("MODEL_REVISION source shape is invalid.");
        if ("PROJECT_FULL".equals(kind) && (source.projectId == null || source.modelId != null || source.revisionId != null || source.baselineId != null)) throw invalid("PROJECT_FULL source shape is invalid.");
        if ("BASELINE_ASSET".equals(kind) && (source.projectId != null || source.modelId == null || source.revisionId == null || source.baselineId == null)) throw invalid("BASELINE_ASSET source shape is invalid.");
    }

    private static void exactFields(ObjectNode node, List<String> expected, String owner) {
        List<String> actual = new ArrayList<>(); node.fieldNames().forEachRemaining(actual::add);
        if (actual.size() != expected.size() || !actual.containsAll(expected)) throw invalid(owner + " has unexpected or missing fields.");
    }

    private static ObjectNode object(ObjectNode node, String field) { JsonNode value = node.get(field); if (value == null || !value.isObject()) throw invalid(field + " must be an object."); return (ObjectNode) value; }
    private static void exact(ObjectNode node, String field, String expected) { if (!expected.equals(text(node, field))) throw invalid(field + " has an unsupported value."); }
    private static String text(ObjectNode node, String field) { return text(node.get(field), field); }
    private static String text(JsonNode value, String field) { if (value == null || !value.isTextual() || value.asText().isBlank()) throw invalid(field + " must be non-blank text."); return value.asText(); }
    private static String nullableText(ObjectNode node, String field) { JsonNode value = node.get(field); if (value == null || value.isNull()) return null; return text(value, field); }
    private static String digest(String value) { if (!value.matches("^[a-f0-9]{64}$")) throw invalid("Digest must be 64 lower-case hex characters."); return value; }
    private static String safePath(String value) { if (value.startsWith("/") || value.endsWith("/") || value.contains("\\") || value.indexOf('\u0000') >= 0 || value.split("/").length == 0) throw invalid("logical_path is unsafe."); for (String segment : value.split("/")) if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) throw invalid("logical_path is unsafe."); return value; }
    private static void assertUnique(List<String> values, String name) { if (values.size() != values.stream().distinct().count()) throw invalid(name + " must be unique."); }
    private static void assertSorted(List<String> values, String name) { List<String> sorted = values.stream().sorted().toList(); if (!values.equals(sorted)) throw invalid(name + " must be sorted."); }
    private static ExchangeException invalid(String message) { return new ExchangeException("EXCHANGE_MANIFEST_INVALID", message); }
    private static String required(String value, String name) { if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank"); return value; }

    public record Producer(String applicationId, String version) { Map<String, Object> json() { return Map.of("application_id", applicationId, "version", version); } }
    public record Source(String projectId, String modelId, String revisionId, String baselineId) { Map<String, Object> json() { Map<String, Object> value = new LinkedHashMap<>(); value.put("project_id", projectId); value.put("model_id", modelId); value.put("revision_id", revisionId); value.put("baseline_id", baselineId); return value; } }
    public record SchemaReference(String schemaId, String schemaVersion) { Map<String, Object> json() { return Map.of("schema_id", schemaId, "schema_version", schemaVersion); } }
    public record Entry(String entryId, String entryRole, String logicalPath, String mediaType, SchemaReference schemaReference, boolean required, int byteLength, String sha256, List<String> dependsOn) { Map<String, Object> json() { Map<String, Object> value = new LinkedHashMap<>(); value.put("entry_id", entryId); value.put("entry_role", entryRole); value.put("logical_path", logicalPath); value.put("media_type", mediaType); value.put("schema_ref", schemaReference.json()); value.put("required", required); value.put("byte_length", byteLength); value.put("sha256", sha256); value.put("depends_on", dependsOn); return value; } }
    public record Extension(String extensionId, String version, boolean required) { Map<String, Object> json() { return Map.of("extension_id", extensionId, "version", version, "required", required); } }
}
