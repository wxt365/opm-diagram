package org.opm.localruntime.command;

import org.opm.localruntime.releaseevidence.fault.E2EFaultContext;

import java.util.Optional;

public interface RevisionCommitRepository {

    Optional<Head> currentHead(String modelId);

    default Optional<Head> currentHead(String modelId, E2EFaultContext context) {
        if (context instanceof E2EFaultContext.Disabled) return currentHead(modelId);
        throw new CommitPersistenceException(CommitFailureCode.PERSISTENCE_FAILED, "Repository does not support an active E2E fault context", null);
    }

    Optional<Receipt> receipt(String operationId, String aggregateId, String commandId);

    CommitResult.Committed commit(RevisionCommitBundle bundle);

    default CommitResult.Committed commit(RevisionCommitBundle bundle, E2EFaultContext context) {
        if (context instanceof E2EFaultContext.Disabled) return commit(bundle);
        throw new CommitPersistenceException(CommitFailureCode.PERSISTENCE_FAILED, "Repository does not support an active E2E fault context", null);
    }

    record Head(String revisionId, int revisionSequence, boolean writable) {
        public Head {
            if (revisionId == null || revisionId.isBlank() || revisionSequence < 1) {
                throw new IllegalArgumentException("head must have a stable revision and positive sequence");
            }
        }
    }

    record Receipt(String requestDigest, String committedRevisionId) {
        public Receipt {
            if (requestDigest == null || requestDigest.isBlank() || committedRevisionId == null || committedRevisionId.isBlank()) {
                throw new IllegalArgumentException("receipt must be complete");
            }
        }
    }
}
