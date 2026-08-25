package org.opm.localruntime.releaseevidence.fault;

import org.opm.localruntime.assets.ProfilePackageDescriptor;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.RevisionCommitRepository;

/** 三个冻结产品边界唯一可调用的故障端口。 */
public interface E2EFaultPort {
    E2EFaultPort NOOP = new E2EFaultPort() {
        @Override public E2EFaultContext contextFor(CandidateRevisionCommand command) { return E2EFaultContext.Disabled.INSTANCE; }
        @Override public void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset) { }
        @Override public void beforeRevisionInsert(E2EFaultContext context) { }
        @Override public RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head) { return head; }
    };

    E2EFaultContext contextFor(CandidateRevisionCommand command);
    void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset);
    void beforeRevisionInsert(E2EFaultContext context);
    RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head);
}
