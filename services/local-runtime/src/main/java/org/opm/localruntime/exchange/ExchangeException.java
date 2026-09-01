package org.opm.localruntime.exchange;

/** 原生交换包拒绝的稳定错误码。 */
public final class ExchangeException extends RuntimeException {

    private final String code;

    public ExchangeException(String code, String message) {
        super(message);
        this.code = code;
    }

    public ExchangeException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
