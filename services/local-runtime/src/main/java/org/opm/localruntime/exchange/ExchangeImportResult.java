package org.opm.localruntime.exchange;

import java.nio.file.Path;
import java.util.List;

/** 原生交换导入成功后返回的只读身份与安装位置。 */
public record ExchangeImportResult(
        String packageId,
        String packageDigest,
        String sourceNamespace,
        String targetProjectId,
        List<String> modelIds,
        List<String> revisionIds,
        List<String> baselineIds,
        Path databasePath) {

    public ExchangeImportResult {
        modelIds = List.copyOf(modelIds);
        revisionIds = List.copyOf(revisionIds);
        baselineIds = List.copyOf(baselineIds);
    }
}
