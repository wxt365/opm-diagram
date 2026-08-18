package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.Set;
import java.util.regex.Pattern;

/** 对物化报告在落盘前执行冻结 0.1 合同的结构校验。 */
final class MaterializationReportSchemaValidator {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Pattern CHANGE_ID = Pattern.compile("^GOLDEN-CANVAS06-[0-9]{8}-[0-9]{3}$");
    private static final Pattern DIGEST = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern REPORT_ID = Pattern.compile("^dev-canvas-06\\.fixture-materialization\\.GOLDEN-CANVAS06-[0-9]{8}-[0-9]{3}\\.[a-f0-9]{64}$");
    private static final Pattern PROJECT_ID = Pattern.compile("^project\\.golden\\.fixture\\.[a-f0-9]{64}$");
    private static final Set<String> ROOT_FIELDS = Set.of("schema_id", "schema_version", "report_id", "report_version", "report_status", "change_id", "materialization_id", "generated_at", "source_date_epoch", "runner_identity", "capture_plan_ref", "evidence_bundle_ref", "source_fixture_ref", "fixture_ref_key", "runtime_binding", "fixture_identity", "materialized_identity", "target_storage", "persistence", "checks", "primary_failure", "failures", "report_payload_sha256");
    private static final Set<String> CHECK_IDS = Set.of("GFM-CHECK-MODE", "GFM-CHECK-ARGS", "GFM-CHECK-RUNTIME-JAR", "GFM-CHECK-PLAN", "GFM-CHECK-FIXTURE-MEMBERSHIP", "GFM-CHECK-BUNDLE", "GFM-CHECK-ARCHIVE", "GFM-CHECK-FIXTURE", "GFM-CHECK-BINDING", "GFM-CHECK-STORAGE");
    private static final Set<String> TABLE_COUNTS = Set.of("project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head", "revision_parent", "operation_record", "idempotency_record", "background_task", "asset_manifest", "element_index", "fact_endpoint_index", "occurrence_index", "finding_index", "text_trace_index");

    private MaterializationReportSchemaValidator() { }

    static void validate(String content) throws Exception {
        JsonNode report = OBJECT_MAPPER.readTree(content);
        if (report == null) throw new IllegalStateException("Report serializer returned no JSON value.");
        try {
            root(report);
            ObjectNode payload = ((ObjectNode) report).deepCopy();
            payload.remove("report_payload_sha256");
            @SuppressWarnings("rawtypes")
            Object value = OBJECT_MAPPER.convertValue(payload, java.util.Map.class);
            if (!report.required("report_payload_sha256").asText().equals(Rfc8785JsonCanonicalizer.sha256(value))) fail();
        } catch (ContractViolation exception) {
            throw new GoldenFixtureMaterializationException("GFM_REPORT_CONTENT_INVALID", "Materialization Report does not satisfy schema 0.1.", exception);
        }
    }

    private static void root(JsonNode value) {
        object(value, ROOT_FIELDS, "schema_id", "schema_version", "report_id", "report_version", "report_status", "change_id", "materialization_id", "generated_at", "source_date_epoch", "runner_identity", "capture_plan_ref", "evidence_bundle_ref", "source_fixture_ref", "fixture_ref_key", "runtime_binding", "fixture_identity", "checks", "failures", "report_payload_sha256");
        constant(value, "schema_id", "OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001");
        constant(value, "schema_version", "0.1");
        pattern(value, "report_id", REPORT_ID); constant(value, "report_version", "0.1.0");
        oneOf(value, "report_status", "MATERIALIZED", "BLOCKED"); pattern(value, "change_id", CHANGE_ID);
        pattern(value, "materialization_id", REPORT_ID); dateTime(value, "generated_at"); nonNegativeInteger(value, "source_date_epoch");
        runner(value.required("runner_identity")); fileRef(value.required("capture_plan_ref")); fileRef(value.required("evidence_bundle_ref"));
        archiveEntryRef(value.required("source_fixture_ref")); digest(value, "fixture_ref_key"); binding(value.required("runtime_binding")); fixtureIdentity(value.required("fixture_identity"));
        checks(value.required("checks")); failures(value.required("failures")); digest(value, "report_payload_sha256");

        if ("MATERIALIZED".equals(value.required("report_status").asText())) materialized(value);
        else blocked(value);
    }

    private static void materialized(JsonNode value) {
        required(value, "materialized_identity", "target_storage", "persistence");
        materializedIdentity(value.required("materialized_identity")); targetStorage(value.required("target_storage")); persistence(value.required("persistence"));
        if (!value.required("failures").isEmpty() || value.required("persistence").required("transaction_status").asText().equals("COMMITTED") == false) fail();
        for (JsonNode check : value.required("checks")) if (!"PASSED".equals(check.required("status").asText())) fail();
    }

    private static void blocked(JsonNode value) {
        required(value, "primary_failure"); failure(value.required("primary_failure"));
        if (value.required("failures").isEmpty() || value.has("materialized_identity") || value.has("target_storage") || value.has("persistence")) fail();
    }

    private static void runner(JsonNode value) {
        object(value, Set.of("contract_version", "runtime_jar_ref", "java_version", "java_vendor", "command"), "contract_version", "runtime_jar_ref", "java_version", "java_vendor", "command");
        constant(value, "contract_version", "0.1.0"); fileRef(value.required("runtime_jar_ref")); nonBlank(value, "java_version"); nonBlank(value, "java_vendor"); nonBlank(value, "command");
    }

    private static void fixtureIdentity(JsonNode value) {
        object(value, Set.of("schema_id", "schema_version", "model_id", "revision_id", "revision_sequence", "parent_revision_id", "fixture_sha256"), "schema_id", "schema_version", "model_id", "revision_id", "revision_sequence", "parent_revision_id", "fixture_sha256");
        constant(value, "schema_id", "MS-REV-001"); constant(value, "schema_version", "0.2"); nonBlank(value, "model_id"); nonBlank(value, "revision_id"); positiveInteger(value, "revision_sequence");
        if (!value.required("parent_revision_id").isNull() && (!value.required("parent_revision_id").isTextual() || value.required("parent_revision_id").asText().isBlank())) fail();
        digest(value, "fixture_sha256");
    }

    private static void materializedIdentity(JsonNode value) {
        object(value, Set.of("project_id", "model_id", "revision_id", "revision_sequence", "draft_head_revision_id", "head_sequence", "history_mode"), "project_id", "model_id", "revision_id", "revision_sequence", "draft_head_revision_id", "head_sequence", "history_mode");
        pattern(value, "project_id", PROJECT_ID); nonBlank(value, "model_id"); nonBlank(value, "revision_id"); positiveInteger(value, "revision_sequence"); nonBlank(value, "draft_head_revision_id"); positiveInteger(value, "head_sequence"); constant(value, "history_mode", "SINGLE_REVISION_SNAPSHOT");
    }

    private static void targetStorage(JsonNode value) {
        object(value, Set.of("storage_root", "database_ref", "storage_schema_version", "database_sha256", "semantic_state_sha256"), "storage_root", "database_ref", "storage_schema_version", "database_sha256", "semantic_state_sha256");
        path(value, "storage_root"); fileRef(value.required("database_ref")); constant(value, "storage_schema_version", "1.0"); digest(value, "database_sha256"); digest(value, "semantic_state_sha256");
    }

    private static void persistence(JsonNode value) {
        object(value, Set.of("transaction_status", "table_counts", "integrity_check", "foreign_key_check", "reopen_matched", "sidecar_absent", "stage_durations_us", "peak_rss_bytes"), "transaction_status", "table_counts", "integrity_check", "foreign_key_check", "reopen_matched", "sidecar_absent", "stage_durations_us", "peak_rss_bytes");
        oneOf(value, "transaction_status", "COMMITTED", "ROLLED_BACK"); tableCounts(value.required("table_counts")); constant(value, "integrity_check", "ok"); integer(value, "foreign_key_check", 0); booleanValue(value, "reopen_matched", true); booleanValue(value, "sidecar_absent", true); durations(value.required("stage_durations_us")); nonNegativeInteger(value, "peak_rss_bytes");
    }

    private static void tableCounts(JsonNode value) {
        object(value, TABLE_COUNTS, TABLE_COUNTS.toArray(String[]::new));
        for (String name : TABLE_COUNTS) integer(value, name, switch (name) { case "project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head" -> 1; default -> 0; });
    }

    private static void durations(JsonNode value) {
        object(value, Set.of("preflight", "migration", "seed", "verify", "report"), "preflight", "migration", "seed", "verify", "report");
        for (String name : Set.of("preflight", "migration", "seed", "verify", "report")) nonNegativeInteger(value, name);
    }

    private static void checks(JsonNode value) {
        if (!value.isArray() || value.size() != 10) fail();
        for (JsonNode check : value) {
            object(check, Set.of("check_id", "status", "code"), "check_id", "status");
            if (!check.required("check_id").isTextual() || !CHECK_IDS.contains(check.required("check_id").asText())) fail();
            oneOf(check, "status", "PASSED", "FAILED", "NOT_RUN");
            if (check.has("code")) nonBlank(check, "code");
        }
    }

    private static void failures(JsonNode value) {
        if (!value.isArray()) fail();
        for (JsonNode failure : value) failure(failure);
    }

    private static void failure(JsonNode value) {
        object(value, Set.of("code", "message_key"), "code", "message_key");
        if (!value.required("code").isTextual() || !value.required("code").asText().matches("^GFM_[A-Z_]+$")) fail(); nonBlank(value, "message_key");
    }

    private static void binding(JsonNode value) {
        object(value, Set.of("profile", "rule_set", "text_grammar", "symbol_catalog", "normalization_adapter", "binding_digest"), "profile", "rule_set", "text_grammar", "symbol_catalog", "normalization_adapter", "binding_digest");
        for (String name : Set.of("profile", "rule_set", "text_grammar", "symbol_catalog", "normalization_adapter")) asset(value.required(name)); digest(value, "binding_digest");
    }

    private static void asset(JsonNode value) { object(value, Set.of("id", "version", "sha256"), "id", "version", "sha256"); nonBlank(value, "id"); nonBlank(value, "version"); digest(value, "sha256"); }
    private static void fileRef(JsonNode value) { object(value, Set.of("kind", "path", "byte_length", "sha256"), "kind", "path", "byte_length", "sha256"); nonBlank(value, "kind"); path(value, "path"); nonNegativeInteger(value, "byte_length"); digest(value, "sha256"); }
    private static void archiveEntryRef(JsonNode value) { object(value, Set.of("path", "byte_length", "sha256", "bundle_sha256", "archive_entry_path"), "path", "byte_length", "sha256", "bundle_sha256", "archive_entry_path"); path(value, "path"); nonNegativeInteger(value, "byte_length"); digest(value, "sha256"); digest(value, "bundle_sha256"); path(value, "archive_entry_path"); }

    private static void object(JsonNode value, Set<String> fields, String... required) { if (!value.isObject()) fail(); value.fieldNames().forEachRemaining(name -> { if (!fields.contains(name)) fail(); }); required(value, required); }
    private static void required(JsonNode value, String... names) { for (String name : names) if (!value.has(name)) fail(); }
    private static void constant(JsonNode value, String field, String expected) { if (!value.required(field).isTextual() || !expected.equals(value.required(field).asText())) fail(); }
    private static void nonBlank(JsonNode value, String field) { if (!value.required(field).isTextual() || value.required(field).asText().isBlank()) fail(); }
    private static void pattern(JsonNode value, String field, Pattern pattern) { if (!value.required(field).isTextual() || !pattern.matcher(value.required(field).asText()).matches()) fail(); }
    private static void digest(JsonNode value, String field) { pattern(value, field, DIGEST); }
    private static void path(JsonNode value, String field) { String path = value.required(field).asText(); if (!value.required(field).isTextual() || path.isBlank() || path.startsWith("/") || path.contains("//") || path.equals("..") || path.startsWith("../") || path.endsWith("/..") || path.contains("/../")) fail(); }
    private static void dateTime(JsonNode value, String field) { try { Instant.parse(value.required(field).asText()); } catch (Exception exception) { fail(); } }
    private static void positiveInteger(JsonNode value, String field) { if (!value.required(field).isIntegralNumber() || value.required(field).asLong() < 1) fail(); }
    private static void nonNegativeInteger(JsonNode value, String field) { if (!value.required(field).isIntegralNumber() || value.required(field).asLong() < 0) fail(); }
    private static void integer(JsonNode value, String field, int expected) { if (!value.required(field).isIntegralNumber() || value.required(field).asInt() != expected) fail(); }
    private static void booleanValue(JsonNode value, String field, boolean expected) { if (!value.required(field).isBoolean() || value.required(field).asBoolean() != expected) fail(); }
    private static void oneOf(JsonNode value, String field, String... expected) { if (!value.required(field).isTextual()) fail(); for (String option : expected) if (option.equals(value.required(field).asText())) return; fail(); }
    private static void fail() { throw new ContractViolation(); }

    private static final class ContractViolation extends RuntimeException { }
}
