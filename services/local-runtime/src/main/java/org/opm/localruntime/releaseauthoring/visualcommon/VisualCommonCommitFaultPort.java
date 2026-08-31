package org.opm.localruntime.releaseauthoring.visualcommon;

@FunctionalInterface
public interface VisualCommonCommitFaultPort {

    VisualCommonCommitFaultPort NOOP = context -> { };

    void beforeRevisionInsert(VisualCommonCommitFaultContext context);
}
