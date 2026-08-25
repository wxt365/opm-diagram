package org.opm.localruntime.releaseevidence.fault;

import java.util.Objects;

/** 只用于受控 child 的启动和协议失败。 */
public final class E2EFaultLauncherException extends RuntimeException {

    private final E2EFaultLauncherErrorCode code;
    private final String stage;
    private final String caseId;
    private final Integer attemptOrdinal;
    private boolean reported;

    public E2EFaultLauncherException(E2EFaultLauncherErrorCode code, String stage, String caseId,
                                     Integer attemptOrdinal, String message) {
        super(message);
        this.code = Objects.requireNonNull(code, "code must not be null");
        this.stage = Objects.requireNonNull(stage, "stage must not be null");
        this.caseId = caseId;
        this.attemptOrdinal = attemptOrdinal;
    }

    public E2EFaultLauncherErrorCode code() { return code; }
    public String stage() { return stage; }
    public String caseId() { return caseId; }
    public Integer attemptOrdinal() { return attemptOrdinal; }
    public int exitCode() { return code.exitCode(); }

    public synchronized void reportOnce() {
        if (reported) return;
        System.err.println(code + "\t" + stage + "\t" + (caseId == null ? "-" : caseId)
                + "\t" + (attemptOrdinal == null ? "-" : attemptOrdinal));
        reported = true;
    }

    public synchronized boolean reported() { return reported; }
}
