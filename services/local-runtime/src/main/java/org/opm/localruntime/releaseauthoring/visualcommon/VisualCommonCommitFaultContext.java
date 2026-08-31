package org.opm.localruntime.releaseauthoring.visualcommon;

/** Visual Common 受控提交故障的最小命令上下文。 */
public record VisualCommonCommitFaultContext(
        String commandId,
        String projectId,
        String modelId,
        String baseRevisionId,
        String candidateRevisionId,
        int candidateRevisionSequence) {
}
