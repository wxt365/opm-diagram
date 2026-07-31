package org.opm.localruntime.semantic;

/** 历史 Revision 回放的稳定失败分类。 */
public final class HistoricalRevisionReplayException extends RuntimeException {

    private final Code code;

    public HistoricalRevisionReplayException(Code code, String message) {
        super(message);
        this.code = code;
    }

    public HistoricalRevisionReplayException(Code code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public Code code() {
        return code;
    }

    public enum Code {
        HISTORICAL_REVISION_UNSUPPORTED,
        HISTORICAL_ASSET_MISSING,
        HISTORICAL_ASSET_DIGEST_MISMATCH,
        HISTORICAL_RENDERER_MISSING
    }
}
