package org.opm.localruntime.command;

import java.util.Optional;

public interface RevisionCommitRepository {

    Optional<Head> currentHead(String modelId);

    Optional<Receipt> receipt(String operationId, String aggregateId, String commandId);

    CommitResult.Committed commit(RevisionCommitBundle bundle);

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
