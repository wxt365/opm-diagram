package org.opm.localruntime.releaseauthoring;

public final class GoldenFixtureMaterializationException extends RuntimeException {
    private final String code;

    public GoldenFixtureMaterializationException(String code, String message) {
        super(message);
        this.code = code;
    }

    public GoldenFixtureMaterializationException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static int exitCodeFor(String code) {
        if ("GFM_REPORT_WRITE_FAILED".equals(code) || "GFM_REPORT_ENGINE_FAILED".equals(code) || "GFM_INTERNAL_ERROR".equals(code)
                || "GFM_PERFORMANCE_PROBE_FAILED".equals(code) || "GFM_QUARANTINE_FAILED".equals(code)) return 4;
        return switch (code) {
            case "GFM_RUNTIME_JAR_MISMATCH", "GFM_BUNDLE_REF_MISMATCH", "GFM_FIXTURE_REF_MISMATCH",
                    "GFM_BINDING_MISMATCH", "GFM_IDENTITY_MISMATCH", "GFM_TARGET_STORAGE_UNSAFE",
                    "GFM_TARGET_STORAGE_NOT_EMPTY", "GFM_CLEANUP_FAILED", "GFM_STORAGE_MIGRATION_FAILED",
                    "GFM_STORAGE_WRITE_FAILED", "GFM_STORAGE_VERIFY_FAILED", "GFM_REPORT_CONTENT_INVALID",
                    "GOLDEN_COMMON_BINDING_MISMATCH", "GOLDEN_COLOR_PROFILE_MISMATCH",
                    "GOLDEN_COMMON_STORAGE_NOT_EMPTY", "GOLDEN_COMMON_MIGRATION_FAILED",
                    "GOLDEN_COMMON_SEED_FAILED", "GOLDEN_COMMON_STORAGE_VERIFY_FAILED",
                    "GOLDEN_COMMON_CLONE_FAILED", "GOLDEN_COMMON_UI_SETUP_FAILED",
                    "GOLDEN_COMMON_PROJECTION_MISMATCH", "GOLDEN_COMMON_CAPTURE_CALLBACK_FAILED",
                    "GOLDEN_COMMON_CAPTURE_RESULT_INVALID", "GOLDEN_FAMILY_CAPTURE_FAILED" -> 3;
            case "GOLDEN_COMMON_INTERNAL_ERROR", "GOLDEN_COMMON_NORMALIZED_RESULT_INVALID",
                    "GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR" -> 4;
            default -> 2;
        };
    }
}
