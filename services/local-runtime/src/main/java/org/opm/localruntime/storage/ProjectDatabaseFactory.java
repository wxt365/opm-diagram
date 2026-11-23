package org.opm.localruntime.storage;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Objects;
public final class ProjectDatabaseFactory {
    private final Path storageRoot;
    private final RuntimeStore store;
    private final boolean journaledDrafts;
    public static ProjectDatabaseFactory journaledDrafts(Path root) { return new ProjectDatabaseFactory(root,StorageStores.tools(root),true); }
    public ProjectDatabaseFactory(Path root) { this(root,StorageStores.tools(root),false); }
    public ProjectDatabaseFactory(Path root,RuntimeStore store,boolean journaled) {
        this.storageRoot=Objects.requireNonNull(root).toAbsolutePath().normalize();this.store=Objects.requireNonNull(store);this.journaledDrafts=journaled;
    }
    public ProjectDatabaseOpenResult open(String project) { return new ProjectDatabaseOpenResult.Ready(new ProjectDatabase(databaseScope(project)),Optional.empty()); }
    public ProjectDatabaseOpenResult openForModelLifecycle(String project) { return open(project); }
    public boolean usesJournaledDrafts(){return journaledDrafts;}
    public ProjectScope databaseScope(String project) {
        if(project==null||project.isBlank())throw new IllegalArgumentException("Project ID required");return store.project(project);
    }
    public Path storageRoot(){return storageRoot;}
    public Path snapshot(String project) {try{return store.snapshot(storageRoot,databaseScope(project));}catch(Exception e){throw new StorageAccessException("Cannot export project snapshot",e);}}
    public RuntimeStore store(){return store;}
}
