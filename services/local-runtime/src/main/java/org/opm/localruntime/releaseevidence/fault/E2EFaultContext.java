package org.opm.localruntime.releaseevidence.fault;

/** 由同一 E2E port 显式传递的命令上下文，禁止使用 null 或线程上下文替代。 */
public sealed interface E2EFaultContext permits E2EFaultContext.Disabled, E2EFaultContext.Active {
    record Disabled() implements E2EFaultContext { public static final Disabled INSTANCE = new Disabled(); }
    record Active(String caseId, int attemptOrdinal, String projectId, String modelId, String baseRevisionId,
                  String candidateRevisionId, String commandId, String profileId, String profileVersion,
                  String symbolAssetSha256) implements E2EFaultContext { }
}
