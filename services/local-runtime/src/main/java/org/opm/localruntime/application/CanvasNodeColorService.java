package org.opm.localruntime.application;

import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.storage.CanvasNodeColorRepository;
import org.opm.localruntime.storage.StorageAccessException;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public final class CanvasNodeColorService {
    private static final Set<String> KINDS = Set.of("object", "process", "attribute", "operation", "state");
    private final CanvasNodeColorRepository repository;
    public CanvasNodeColorService(CanvasNodeColorRepository repository) { this.repository = repository; }

    public Map<String, Map<String, String>> read() {
        try { return repository.read(); }
        catch (StorageAccessException e) { throw persistence(e); }
    }

    public Map<String, String> write(String kind, Map<String, Object> input) {
        if (!KINDS.contains(kind) || input == null || !Set.of("stroke", "fill").containsAll(input.keySet()))
            throw invalid();
        var colors = new LinkedHashMap<String, String>();
        for (var entry : input.entrySet()) {
            if (!(entry.getValue() instanceof String value) || !value.matches("#[0-9a-fA-F]{6}")) throw invalid();
            colors.put(entry.getKey(), value.toLowerCase(Locale.ROOT));
        }
        try { repository.write(kind, colors); return colors; }
        catch (StorageAccessException e) { throw persistence(e); }
    }

    private static ApiException invalid() { return new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "请选择有效的元素类型及六位十六进制颜色。"); }
    private static ApiException persistence(StorageAccessException cause) {
        var error = new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, true, "统一颜色读取或保存失败，请重试。");
        error.initCause(cause); return error;
    }
}
