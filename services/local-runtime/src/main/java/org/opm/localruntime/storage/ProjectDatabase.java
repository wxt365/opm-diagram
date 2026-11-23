package org.opm.localruntime.storage;
import java.util.Objects;
public record ProjectDatabase(ProjectScope scope) {
    public ProjectDatabase { Objects.requireNonNull(scope); }
    public ProjectScope databaseScope() { return scope; }
    public java.nio.file.Path snapshot() {try{return scope.store().snapshot(java.nio.file.Path.of("target/storage-snapshots",scope.store().schema()),scope);}catch(Exception e){throw new StorageAccessException("Cannot export project snapshot",e);}}
    public StorageSchemaVersion storageSchemaVersion() { return new StorageSchemaVersion("2.0"); }
}
