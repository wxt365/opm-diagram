package org.opm.localruntime.exchange;

import java.time.Instant;
import java.util.Arrays;
import java.util.Objects;

/** 写出首发 MODEL_REVISION 包所需的已固定原始 JSON。 */
public record ExchangeModelRevisionInput(
        String packageId,
        Instant createdAt,
        String producerApplicationId,
        String producerVersion,
        String identityNamespace,
        byte[] modelCatalogJson,
        byte[] revisionJson,
        byte[] capabilityReportJson) {

    public ExchangeModelRevisionInput {
        packageId = required(packageId, "packageId");
        createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
        if (createdAt.getNano() != 0) throw new IllegalArgumentException("createdAt must have whole seconds");
        producerApplicationId = required(producerApplicationId, "producerApplicationId");
        producerVersion = required(producerVersion, "producerVersion");
        identityNamespace = required(identityNamespace, "identityNamespace");
        modelCatalogJson = copy(modelCatalogJson, "modelCatalogJson");
        revisionJson = copy(revisionJson, "revisionJson");
        capabilityReportJson = copy(capabilityReportJson, "capabilityReportJson");
    }

    @Override public byte[] modelCatalogJson() { return modelCatalogJson.clone(); }
    @Override public byte[] revisionJson() { return revisionJson.clone(); }
    @Override public byte[] capabilityReportJson() { return capabilityReportJson.clone(); }

    private static byte[] copy(byte[] value, String name) {
        return Arrays.copyOf(Objects.requireNonNull(value, name + " must not be null"), value.length);
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
        return value;
    }
}
