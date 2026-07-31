package org.opm.localruntime.assets;

import java.util.Objects;

/** Profile 资产在生成前无法形成一致 binding 时的受控失败。 */
public final class ProfilePackageAssemblyException extends RuntimeException {

    private final Code code;

    public ProfilePackageAssemblyException(Code code, String message, Throwable cause) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code must not be null");
    }

    public ProfilePackageAssemblyException(Code code, String message) {
        this(code, message, null);
    }

    public Code code() {
        return code;
    }

    public enum Code {
        PROFILE_ASSET_MISSING,
        PROFILE_ASSET_DIGEST_MISMATCH,
        PROFILE_ASSET_IDENTITY_MISMATCH,
        PROFILE_PACKAGE_INVALID,
        PROFILE_PACKAGE_DIGEST_MISMATCH,
        PROFILE_REVISION_BINDING_MISMATCH,
        PROFILE_BINDING_DIGEST_MISMATCH,
        PROFILE_CAPABILITY_BINDING_MISMATCH
    }
}
