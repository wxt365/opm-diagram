package org.opm.localruntime.releaseevidence.fault;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** Fault Plan 分支唯一 Java validator，不是通用 JSON Schema 引擎。 */
public final class E2EFaultPlanVerifier {
    public static final String EXPECTED_SCHEMA_SHA256 = "d8c34923a1342cdffd5eb4e22ddf328969bf3c1f6b6804e7acebb56dd51891d8";
    static final String SCHEMA_RESOURCE = "/releaseevidence/schema/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json";
    static final String DOMAIN = "OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-001\0";
    private static final Set<String> FIELDS = Set.of("schema_id", "schema_version", "case_id", "attempt_ordinal",
            "fault_kind", "target", "trigger_count", "nonce", "plan_sha256", "artifact_payload_sha256");
    private static final ObjectMapper JSON = new ObjectMapper(JsonFactory.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build());

    private E2EFaultPlanVerifier() { }

    public static VerifiedPlan verify(E2EFaultLauncherArguments arguments) {
        String caseId = arguments.values().get(E2EFaultLauncherArguments.CASE_ID);
        Integer ordinal = integer(arguments, E2EFaultLauncherArguments.ATTEMPT_ORDINAL, "ARGS_SOURCE", caseId);
        verifySchema(caseId, ordinal);
        Path storage = absolute(arguments, "opm.storage.root", E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_PATH_INVALID, "PLAN_PATH", caseId, ordinal);
        Path attemptRoot = storage.getParent();
        Path planPath = absolute(arguments, E2EFaultLauncherArguments.PLAN, E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_PATH_INVALID, "PLAN_PATH", caseId, ordinal);
        if (attemptRoot == null || !planPath.equals(attemptRoot.resolve("fault-plan.json"))) {
            throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_PATH_INVALID, "PLAN_PATH", caseId, ordinal, "Plan path is not the attempt root plan");
        }
        byte[] raw = readPlan(planPath, caseId, ordinal);
        String rawSha = sha256(raw);
        if (!rawSha.equals(arguments.values().get(E2EFaultLauncherArguments.PLAN_RAW_SHA256))) {
            throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_DIGEST_MISMATCH, "PLAN_RAW_SHA", caseId, ordinal, "Plan raw digest differs");
        }
        E2EFaultPlan plan = parse(raw, caseId, ordinal);
        if (!plan.caseId().equals(caseId) || plan.attemptOrdinal() != ordinal) {
            throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_IDENTITY_MISMATCH, "CASE_SCHEDULE_MAPPING", caseId, ordinal, "Plan identity differs from arguments");
        }
        if (!Rfc8785JsonCanonicalizer.sha256(plan.planDigestPayload()).equals(plan.planSha256())
                || !Rfc8785JsonCanonicalizer.sha256(plan.artifactPayload()).equals(plan.artifactPayloadSha256())) {
            throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_DIGEST_MISMATCH, "PLAN_SEMANTIC_SHA", caseId, ordinal, "Plan digest differs");
        }
        verifyMapping(plan, caseId, ordinal);
        verifyHandshake(arguments, plan, rawSha, caseId, ordinal);
        return new VerifiedPlan(plan, planPath, rawSha, fileStamp(planPath, caseId, ordinal));
    }

    private static void verifySchema(String caseId, Integer ordinal) {
        try (InputStream input = E2EFaultPlanVerifier.class.getResourceAsStream(SCHEMA_RESOURCE)) {
            if (input == null || !EXPECTED_SCHEMA_SHA256.equals(sha256(input.readAllBytes()))) {
                throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_SCHEMA_INVALID, "SCHEMA_0_2", caseId, ordinal, "JAR schema resource differs");
            }
        } catch (E2EFaultLauncherException exception) { throw exception; }
        catch (Exception exception) { throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_INTERNAL_ERROR, "SCHEMA_0_2", caseId, ordinal, "Cannot read JAR schema"); }
    }

    private static byte[] readPlan(Path plan, String caseId, Integer ordinal) {
        try {
            if (!Files.isRegularFile(plan, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(plan) || Files.size(plan) < 1 || Files.size(plan) > 4096) {
                throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_PATH_INVALID, "PLAN_FILE_IDENTITY", caseId, ordinal, "Plan file is unsafe");
            }
            return Files.readAllBytes(plan);
        } catch (E2EFaultLauncherException exception) { throw exception; }
        catch (Exception exception) { throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_PATH_INVALID, "PLAN_RAW_READ", caseId, ordinal, "Cannot read plan"); }
    }

    private static E2EFaultPlan parse(byte[] raw, String caseId, Integer ordinal) {
        try {
            if (raw[0] == (byte) 0xef || new String(raw, StandardCharsets.ISO_8859_1).contains("\r") || raw[raw.length - 1] != '\n') {
                throw schema(caseId, ordinal, "UTF8_AND_JSON");
            }
            StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(raw));
            JsonNode root = JSON.readTree(raw);
            if (root == null || !root.isObject() || root.size() != FIELDS.size() || !fieldNames(root).equals(FIELDS)) throw schema(caseId, ordinal, "SCHEMA_0_2");
            String schemaId = text(root, "schema_id", caseId, ordinal);
            String schemaVersion = text(root, "schema_version", caseId, ordinal);
            String planCase = text(root, "case_id", caseId, ordinal);
            int planOrdinal = integer(root, "attempt_ordinal", caseId, ordinal);
            E2EFaultPlan.FaultKind kind = enumValue(E2EFaultPlan.FaultKind.class, root, "fault_kind", caseId, ordinal);
            E2EFaultPlan.Target target = enumValue(E2EFaultPlan.Target.class, root, "target", caseId, ordinal);
            int trigger = integer(root, "trigger_count", caseId, ordinal);
            String nonce = hex(root, "nonce", caseId, ordinal);
            String planSha = hex(root, "plan_sha256", caseId, ordinal);
            String artifactSha = hex(root, "artifact_payload_sha256", caseId, ordinal);
            if (!"OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001".equals(schemaId) || !"0.2".equals(schemaVersion)
                    || !planCase.matches("^E2E-CANVAS-00[1-7]\\..+$") || (planOrdinal != 1 && planOrdinal != 2)) throw schema(caseId, ordinal, "SCHEMA_0_2");
            return new E2EFaultPlan(schemaId, schemaVersion, planCase, planOrdinal, kind, target, trigger, nonce, planSha, artifactSha);
        } catch (E2EFaultLauncherException exception) { throw exception; }
        catch (CharacterCodingException | RuntimeException exception) { throw schema(caseId, ordinal, "UTF8_AND_JSON"); }
        catch (Exception exception) { throw schema(caseId, ordinal, "UTF8_AND_JSON"); }
    }

    private static void verifyMapping(E2EFaultPlan plan, String caseId, Integer ordinal) {
        boolean matches = switch (plan.faultKind()) {
            case ASSET_MISSING -> plan.caseId().equals("E2E-CANVAS-007.ASSET_MISSING") && plan.target() == E2EFaultPlan.Target.SYMBOL_CATALOG_ASSET && plan.triggerCount() == 1;
            case PERSISTENCE_FAILED -> plan.caseId().equals("E2E-CANVAS-007.PERSISTENCE_FAILED") && plan.target() == E2EFaultPlan.Target.SQLITE_BEFORE_REVISION_INSERT && plan.triggerCount() == 1;
            case READONLY -> plan.caseId().equals("E2E-CANVAS-007.READONLY") && plan.target() == E2EFaultPlan.Target.PROJECT_STORAGE_READ_ONLY && plan.triggerCount() == 1;
            case NONE -> false;
        };
        if (!matches) throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_IDENTITY_MISMATCH, "CASE_SCHEDULE_MAPPING", caseId, ordinal, "Fault mapping is not enabled");
    }

    private static void verifyHandshake(E2EFaultLauncherArguments arguments, E2EFaultPlan plan, String rawSha, String caseId, Integer ordinal) {
        try {
            String parent = arguments.values().get(E2EFaultLauncherArguments.PARENT_NONCE);
            if (!hex(parent) || !parent.equals(plan.nonce())) throw handshake(caseId, ordinal);
            Path challenge = absolute(arguments, E2EFaultLauncherArguments.CHALLENGE, E2EFaultLauncherErrorCode.E2E_FAULT_HANDSHAKE_INVALID, "CHALLENGE_FILE", caseId, ordinal);
            byte[] challengeRaw = Files.readAllBytes(challenge);
            if (!Files.isRegularFile(challenge, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(challenge) || challengeRaw.length != 32) throw handshake(caseId, ordinal);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(HexFormat.of().parseHex(parent), "HmacSHA256"));
            mac.update(DOMAIN.getBytes(StandardCharsets.US_ASCII)); mac.update(challengeRaw); mac.update(HexFormat.of().parseHex(rawSha));
            byte[] expected = mac.doFinal();
            String response = arguments.values().get(E2EFaultLauncherArguments.CHALLENGE_RESPONSE);
            if (!hex(response) || !MessageDigest.isEqual(expected, HexFormat.of().parseHex(response))) throw handshake(caseId, ordinal);
        } catch (E2EFaultLauncherException exception) { throw exception; }
        catch (Exception exception) { throw handshake(caseId, ordinal); }
    }

    private static Set<String> fieldNames(JsonNode node) { Set<String> names = new LinkedHashSet<>(); node.fieldNames().forEachRemaining(names::add); return names; }
    private static String text(JsonNode node, String field, String caseId, Integer ordinal) { if (!node.path(field).isTextual()) throw schema(caseId, ordinal, "SCHEMA_0_2"); return node.get(field).asText(); }
    private static String hex(JsonNode node, String field, String caseId, Integer ordinal) { String value = text(node, field, caseId, ordinal); if (!hex(value)) throw schema(caseId, ordinal, "SCHEMA_0_2"); return value; }
    private static boolean hex(String value) { return value != null && value.matches("^[a-f0-9]{64}$"); }
    private static int integer(JsonNode node, String field, String caseId, Integer ordinal) { if (!node.path(field).isInt()) throw schema(caseId, ordinal, "SCHEMA_0_2"); return node.get(field).intValue(); }
    private static <T extends Enum<T>> T enumValue(Class<T> type, JsonNode node, String field, String caseId, Integer ordinal) { try { return Enum.valueOf(type, text(node, field, caseId, ordinal)); } catch (Exception exception) { throw schema(caseId, ordinal, "SCHEMA_0_2"); } }
    private static Integer integer(E2EFaultLauncherArguments values, String key, String stage, String caseId) { try { return Integer.valueOf(values.values().get(key)); } catch (Exception exception) { throw E2EFaultLauncherArguments.invalid(stage, caseId, null, "Invalid attempt ordinal"); } }
    private static Path absolute(E2EFaultLauncherArguments values, String key, E2EFaultLauncherErrorCode code, String stage, String caseId, Integer ordinal) { try { Path value = Path.of(values.values().get(key)); if (!value.isAbsolute()) throw new IllegalArgumentException(); return value.normalize(); } catch (Exception exception) { throw failure(code, stage, caseId, ordinal, "Path must be absolute"); } }
    private static String sha256(byte[] raw) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private static E2EFaultLauncherException schema(String caseId, Integer ordinal, String stage) { return failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_SCHEMA_INVALID, stage, caseId, ordinal, "Plan schema is invalid"); }
    private static E2EFaultLauncherException handshake(String caseId, Integer ordinal) { return failure(E2EFaultLauncherErrorCode.E2E_FAULT_HANDSHAKE_INVALID, "CHALLENGE_RESPONSE", caseId, ordinal, "Fault handshake is invalid"); }
    static E2EFaultLauncherException failure(E2EFaultLauncherErrorCode code, String stage, String caseId, Integer ordinal, String message) { return new E2EFaultLauncherException(code, stage, caseId, ordinal, message); }

    public record VerifiedPlan(E2EFaultPlan plan, Path planPath, String rawSha256, FileStamp initialStamp) {
        public void verifyNoDrift(String stage) {
            byte[] raw = readPlan(planPath, plan.caseId(), plan.attemptOrdinal());
            if (!rawSha256.equals(sha256(raw)) || !initialStamp.equals(fileStamp(planPath, plan.caseId(), plan.attemptOrdinal()))) {
                throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_DRIFT, stage, plan.caseId(), plan.attemptOrdinal(), "Plan changed after validation");
            }
        }
    }

    record FileStamp(Object key, long size, long modifiedMillis) { }
    private static FileStamp fileStamp(Path path, String caseId, Integer ordinal) {
        try { var attributes = Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS); return new FileStamp(attributes.fileKey(), attributes.size(), attributes.lastModifiedTime().toMillis()); }
        catch (Exception exception) { throw failure(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_PATH_INVALID, "PLAN_FILE_IDENTITY", caseId, ordinal, "Cannot stat plan"); }
    }
}
