package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import org.opm.localruntime.api.DraftWorkspaceSchema;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.*;
import org.opm.localruntime.storage.DraftSaveRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.text.OplTextGenerationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.LongSupplier;

/** 只注册明确访问的模型，不扫描、迁移或启用用户数据库。 */
@Service
public final class DraftSaveService implements AutoCloseable {
    private record Key(String project, String model) { }
    private final ProjectDatabaseFactory databases;
    private final ProfilePackageAssembler profiles;
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final ScheduledExecutorService executor;
    private final Map<Key, DraftSaveCoordinator> coordinators = new HashMap<>();
    private boolean closed;

    @Autowired
    public DraftSaveService(ProjectDatabaseFactory databases, FileProfilePackageLoader loader) {
        this(databases, loader, Clock.systemUTC(), System::nanoTime, Executors.newScheduledThreadPool(2, task -> {
            var thread = new Thread(task, "opm-draft-save"); thread.setDaemon(true); return thread;
        }));
    }
    public DraftSaveService(ProjectDatabaseFactory databases, FileProfilePackageLoader loader, Clock clock,
                            LongSupplier nanoTime, ScheduledExecutorService executor) {
        this.databases = databases; this.profiles = new ProfilePackageAssembler(loader); this.clock = clock;
        this.nanoTime = nanoTime; this.executor = executor;
    }

    public SaveResult save(String project, String model, SaveRequest request) {
        var coordinator = coordinator(project, model);
        var result = coordinator.requestManual(request); coordinator.poll();
        try { return result.join(); }
        catch (CompletionException exception) {
            if (exception.getCause() instanceof RuntimeException cause) throw cause;
            throw new DraftWorkspaceService.Failure("PERSISTENCE_FAILED", null);
        }
    }
    public SaveState state(String project, String model) { return coordinator(project, model).state(); }

    public PinResult pin(String project, String model, PinRequest request) {
        var coordinator = coordinator(project, model);
        var result = coordinator.requestPin(request); coordinator.poll();
        try { return result.join(); }
        catch (CompletionException exception) {
            if (exception.getCause() instanceof RuntimeException cause) throw cause;
            throw new DraftWorkspaceService.Failure("PERSISTENCE_FAILED", null);
        }
    }

    private synchronized DraftSaveCoordinator coordinator(String project, String model) {
        var json = new ObjectMapper();
        DraftWorkspaceSchema.validate(json.valueToTree(project), "StableId"); DraftWorkspaceSchema.validate(json.valueToTree(model), "StableId");
        if (closed) throw new DraftWorkspaceService.Failure("PERSISTENCE_FAILED", null);
        var key = new Key(project, model); var existing = coordinators.get(key); if (existing != null) return existing;
        var path = databases.databasePath(project);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
        var repository = new DraftSaveRepository(path, clock); repository.read(project, model);
        var created = new DraftSaveCoordinator(project, model, repository, this::validate, clock, nanoTime);
        created.start(executor); coordinators.put(key, created); return created;
    }

    private void validate(ObjectNode document) {
        try {
            var revision = DraftSemanticView.read(document);
            if (!revision.profileBinding().equals(RuntimeActiveBindingProvider.current()))
                throw new DraftWorkspaceService.Failure("RULE_VERSION_CONFLICT", null);
            if (!new SemanticRevisionValidator().validate(revision).isEmpty())
                throw new DraftWorkspaceService.Failure("SAVE_VALIDATION_BLOCKED", null);
            // 全模型保存不能让孤立 Fact 因不属于任何视图而被文本校验共同漏掉。
            if (revision.facts().stream().anyMatch(fact -> revision.occurrences().stream().noneMatch(occurrence ->
                    occurrence.targetKind() == SemanticRevision.TargetKind.FACT && occurrence.targetId().equals(fact.id())
                            && occurrence.ownership() == SemanticRevision.OccurrenceOwnership.OWNED)))
                throw new DraftWorkspaceService.Failure("SAVE_VALIDATION_BLOCKED", null);
            var assets = profiles.assemble(revision.profileBinding()); var text = new OplTextGenerationService();
            for (var context : revision.contexts()) {
                var generated = text.generate(revision, context.id(), assets);
                text.validateActiveWriteEvidence(revision, assets, generated);
            }
        } catch (DraftWorkspaceService.Failure exception) { throw exception; }
        catch (RuntimeException exception) {
            var failure = new DraftWorkspaceService.Failure("SAVE_VALIDATION_BLOCKED", null); failure.initCause(exception); throw failure;
        }
    }

    @Override @PreDestroy public void close() {
        synchronized (this) {
            if (closed) return; closed = true;
            coordinators.values().forEach(DraftSaveCoordinator::close); coordinators.clear(); executor.shutdown();
        }
        // 在途事务自然完成；不使用 shutdownNow 中断 SQLite 提交。
        try { executor.awaitTermination(30, TimeUnit.SECONDS); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
    }
}
