package org.opm.localruntime.releaseevidence.fault;

/** E2E 故障启动协议的稳定错误码，不能映射为产品 API 错误。 */
public enum E2EFaultLauncherErrorCode {
    E2E_FAULT_CONFIGURATION_INVALID(2),
    E2E_FAULT_PLAN_PATH_INVALID(2),
    E2E_FAULT_PLAN_SCHEMA_INVALID(2),
    E2E_FAULT_PLAN_DIGEST_MISMATCH(3),
    E2E_FAULT_IDENTITY_MISMATCH(3),
    E2E_FAULT_HANDSHAKE_INVALID(3),
    E2E_FAULT_PLAN_DRIFT(3),
    E2E_FAULT_CONTEXT_MISMATCH(3),
    E2E_FAULT_ALREADY_TRIGGERED(3),
    E2E_FAULT_NOT_TRIGGERED(3),
    E2E_FAULT_INTERNAL_ERROR(4);

    private final int exitCode;

    E2EFaultLauncherErrorCode(int exitCode) { this.exitCode = exitCode; }

    public int exitCode() { return exitCode; }
}
