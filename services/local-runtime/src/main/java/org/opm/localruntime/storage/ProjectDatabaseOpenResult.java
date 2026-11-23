package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.util.Objects;
import java.util.Optional;

public interface ProjectDatabaseOpenResult {

    record Ready(ProjectDatabase database, Optional<Path> recoveryPoint) implements ProjectDatabaseOpenResult {

        public Ready {
            Objects.requireNonNull(database, "database must not be null");
            Objects.requireNonNull(recoveryPoint, "recoveryPoint must not be null");
        }
    }

    record RecoveryRequired(ProjectScope databasePath, Optional<Path> recoveryPoint, Path markerPath) implements ProjectDatabaseOpenResult {

        public RecoveryRequired {
            Objects.requireNonNull(databasePath, "databasePath must not be null");
            Objects.requireNonNull(recoveryPoint, "recoveryPoint must not be null");
            Objects.requireNonNull(markerPath, "markerPath must not be null");
        }
    }
}
