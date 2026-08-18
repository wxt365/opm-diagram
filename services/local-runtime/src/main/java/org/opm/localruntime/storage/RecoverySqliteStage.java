package org.opm.localruntime.storage;

public enum RecoverySqliteStage {
    AFTER_REVISION_INSERT,
    AFTER_PARENT_INSERT,
    AFTER_TRACE_INSERT,
    AFTER_FINDING_INSERT,
    BEFORE_HEAD_UPDATE,
    AFTER_OPERATION_INSERT,
    AFTER_RECEIPT_INSERT
}
