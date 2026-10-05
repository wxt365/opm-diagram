package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;

/** 语义视图查询与命令候选共用的无存储基础操作。 */
final class SemanticViewSupport {
    private SemanticViewSupport() { }

    static SemanticRevision.Context context(SemanticRevision revision, String contextId) { return revision.contexts().stream().filter(value -> value.id().equals(contextId)).findFirst().orElseThrow(() -> notFound("Context 不存在")); }

    static Map<String, String> labels(SemanticRevision revision) { Map<String, String> result = new LinkedHashMap<>(); revision.elements().forEach(value -> result.put(value.id(), value.name().localName())); revision.features().forEach(value -> result.put(value.id(), value.name().localName())); revision.states().forEach(value -> result.put(value.id(), value.name().localName())); revision.facts().forEach(value -> result.put(value.id(), value.id())); return result; }

    static boolean isConsumptionCapability(String capabilityId) { return "CAP-CONSUMPTION-001".equals(capabilityId) || ProceduralLinkCatalog.CONSUMPTION.equals(capabilityId) || "CAP-ISO-PROC-006".equals(capabilityId); }

    static ApiException domain(String message) { return new ApiException(ApiErrorCode.DOMAIN_REJECTED, 422, false, message); }

    static ApiException notFound(String message) { return new ApiException(ApiErrorCode.NOT_FOUND, 404, false, message); }

    static String digest(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder(bytes.length * 2); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString(); } catch (Exception exception) { throw new IllegalStateException(exception); } }
}
