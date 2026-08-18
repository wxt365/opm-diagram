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
import java.util.LinkedHashMap;
import java.util.Map;

/** 按 Recovery Attempt Materialization 0.1 的唯一身份写入不可覆盖 JSON。 */
final class RecoveryAttemptMaterializationWriter {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    Map<String, Object> write(Path fixtureRoot, Input input) {
        try {
            if (Files.isSymbolicLink(fixtureRoot) || !Files.isDirectory(fixtureRoot, LinkOption.NOFOLLOW_LINKS)) {
                throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery materialization fixture root is invalid.");
            }
            Map<String, Object> value = value(input);
            Path target = fixtureRoot.resolve("materialization.json");
            atomicWrite(target, OBJECT_MAPPER.writeValueAsBytes(value));
            return Map.copyOf(value);
        } catch (RecoveryFactorySqliteMaterializer.RecoveryFactoryException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Cannot write Recovery materialization JSON.", exception);
        }
    }

    Map<String, Object> value(Input input) {
        requireDigest(input.caseDefinitionSha256(), "case definition");
        requireFileRef(input.sourceRefs(), "manifest_ref", "RECOVERY_MANIFEST");
        requireFileRef(input.sourceRefs(), "runtime_jar_ref", "LOCAL_RUNTIME_JAR");
        requireFileRef(input.sourceRefs(), "factory_helper_jar_ref", "RECOVERY_TEST_TOOLS_JAR");
        requireFileRef(input.sourceRefs(), "model_template_ref", "RECOVERY_TEMPLATE");
        requireFileRef(input.sourceRefs(), "gate_template_ref", "RECOVERY_TEMPLATE");
        requireFileRef(input.sourceRefs(), "base_revision_ref", "MS_REV_001_V02");
        if (input.attemptOrdinal() != 1 && input.attemptOrdinal() != 2) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery attempt ordinal is invalid.");
        }
        Map<String, Object> key = new LinkedHashMap<>();
        key.put("manifest_sha256", refSha(input.sourceRefs(), "manifest_ref"));
        key.put("model_template_sha256", refSha(input.sourceRefs(), "model_template_ref"));
        key.put("gate_template_sha256", refSha(input.sourceRefs(), "gate_template_ref"));
        key.put("base_revision_sha256", refSha(input.sourceRefs(), "base_revision_ref"));
        key.put("runtime_jar_sha256", refSha(input.sourceRefs(), "runtime_jar_ref"));
        key.put("factory_helper_jar_sha256", refSha(input.sourceRefs(), "factory_helper_jar_ref"));
        key.put("case_id", input.caseId());
        key.put("base_scenario_id", input.baseScenarioId());
        key.put("attempt_ordinal", input.attemptOrdinal());
        key.put("source_date_epoch", input.sourceDateEpoch());
        String materializationKey = sha256(Rfc8785JsonCanonicalizer.canonicalize(key).getBytes(StandardCharsets.UTF_8));

        Map<String, Object> value = new LinkedHashMap<>();
        value.put("schema_id", "OPM-DEV-CANVAS-06-RECOVERY-ATTEMPT-MATERIALIZATION-001");
        value.put("schema_version", "0.1");
        value.put("contract_version", "0.1.0");
        value.put("materialization_id", "dev-canvas-06.recovery-materialization." + input.caseId() + "." + input.attemptOrdinal() + "." + materializationKey.substring(0, 12));
        value.put("case_id", input.caseId());
        value.put("category", input.category());
        value.put("base_scenario_id", input.baseScenarioId());
        value.put("attempt_ordinal", input.attemptOrdinal());
        value.put("source_date_epoch", input.sourceDateEpoch());
        value.put("case_definition_sha256", input.caseDefinitionSha256());
        value.put("source_build", input.sourceBuild());
        value.put("source_refs", input.sourceRefs());
        value.put("active_binding", input.activeBinding());
        value.put("base_revision_identity", input.baseRevisionIdentity());
        value.put("profile_assets", input.profileAssets());
        value.put("storage", input.storage());
        value.put("descriptors", input.descriptors());
        value.put("base_snapshot", input.baseSnapshot());
        value.put("materialization_payload_sha256", sha256(Rfc8785JsonCanonicalizer.canonicalize(value).getBytes(StandardCharsets.UTF_8)));
        return value;
    }

    private void atomicWrite(Path target, byte[] bytes) throws IOException {
        Path temporary = target.resolveSibling("." + target.getFileName() + ".tmp");
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS) || Files.exists(temporary, LinkOption.NOFOLLOW_LINKS)) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery materialization target is not fresh.");
        }
        try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            channel.write(ByteBuffer.wrap(bytes));
            channel.force(true);
        }
        try {
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.deleteIfExists(temporary);
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery materialization atomic rename is unavailable.", exception);
        } catch (IOException exception) {
            Files.deleteIfExists(temporary);
            throw exception;
        }
    }

    @SuppressWarnings("unchecked")
    private void requireFileRef(Map<String, Object> sourceRefs, String name, String kind) {
        Object raw = sourceRefs.get(name);
        if (!(raw instanceof Map<?, ?> reference)) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery source ref is missing: " + name);
        }
        if (!kind.equals(reference.get("kind")) || !(reference.get("path") instanceof String)
                || !(reference.get("byte_length") instanceof Number) || !(reference.get("sha256") instanceof String digest)) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery source ref is invalid: " + name);
        }
        requireDigest(digest, name);
    }

    @SuppressWarnings("unchecked")
    private String refSha(Map<String, Object> sourceRefs, String name) {
        return (String) ((Map<String, Object>) sourceRefs.get(name)).get("sha256");
    }

    private void requireDigest(String value, String label) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("Recovery digest is invalid: " + label);
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new RecoveryFactorySqliteMaterializer.RecoveryFactoryException("SHA-256 is unavailable.", exception);
        }
    }

    record Input(String caseId, String category, String baseScenarioId, int attemptOrdinal, long sourceDateEpoch,
                 String caseDefinitionSha256, Map<String, Object> sourceBuild, Map<String, Object> sourceRefs,
                 Map<String, Object> activeBinding, Map<String, Object> baseRevisionIdentity,
                 Map<String, Object> profileAssets, Map<String, Object> storage, Map<String, Object> descriptors,
                 Map<String, Object> baseSnapshot) {
    }
}
