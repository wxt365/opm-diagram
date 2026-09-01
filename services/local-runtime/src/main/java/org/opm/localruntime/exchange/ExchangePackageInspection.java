package org.opm.localruntime.exchange;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** 仅包含已验证包内字节的零业务写入 inspection 结果。 */
public final class ExchangePackageInspection {

    private final ExchangePackageManifest manifest;
    private final Map<String, byte[]> entries;

    ExchangePackageInspection(ExchangePackageManifest manifest, Map<String, byte[]> entries) {
        this.manifest = Objects.requireNonNull(manifest, "manifest must not be null");
        Map<String, byte[]> copied = new LinkedHashMap<>();
        entries.forEach((path, raw) -> copied.put(path, raw.clone()));
        this.entries = Map.copyOf(copied);
    }

    public ExchangePackageManifest manifest() {
        return manifest;
    }

    public byte[] entry(String logicalPath) {
        byte[] raw = entries.get(logicalPath);
        if (raw == null) throw new ExchangeException("EXCHANGE_REFERENCE_INVALID", "Requested entry is absent: " + logicalPath);
        return Arrays.copyOf(raw, raw.length);
    }
}
