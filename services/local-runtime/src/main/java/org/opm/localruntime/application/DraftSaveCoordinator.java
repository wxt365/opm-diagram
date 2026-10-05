package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.storage.DraftSaveRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** 单模型保存队列；由宿主显式注册和启动，不扫描或迁移用户库。 */
public final class DraftSaveCoordinator implements AutoCloseable {
    interface Backend {
        DraftJournalRepository.Snapshot read();
        SaveResult manual(SaveRequest request);
        PinResult pin(PinRequest request);
        void checkpoint();
    }
    private sealed interface Task permits Pending, PendingPin {
        String key();
        String mode();
        void execute(Backend backend);
        void fail(RuntimeException exception);
    }
    private record Pending(SaveRequest request, CompletableFuture<SaveResult> future) implements Task {
        public String key() { return "SAVE:" + request.save_id(); }
        public String mode() { return "MANUAL"; }
        public void execute(Backend backend) { future.complete(backend.manual(request)); }
        public void fail(RuntimeException exception) { future.completeExceptionally(exception); }
    }
    private record PendingPin(PinRequest request, CompletableFuture<PinResult> future) implements Task {
        public String key() { return "PIN:" + request.pin_id(); }
        public String mode() { return "PIN"; }
        public void execute(Backend backend) { future.complete(backend.pin(request)); }
        public void fail(RuntimeException exception) { future.completeExceptionally(exception); }
    }
    private final Backend backend;
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final ReentrantLock running = new ReentrantLock();
    private final LinkedHashMap<String, Task> pending = new LinkedHashMap<>();
    private Task active;
    private String inFlight = "NONE", deadlineDirty;
    private long dueNanos, retryNanos;
    private boolean retrying, automaticBlocked, closed;
    private int failures;
    private SaveError lastError;
    private ScheduledFuture<?> timer;

    public DraftSaveCoordinator(String project, String model, DraftSaveRepository repository, Consumer<ObjectNode> validate,
                                Clock clock, LongSupplier nanoTime) {
        this(new Backend() {
            public DraftJournalRepository.Snapshot read() { return repository.read(project, model); }
            public SaveResult manual(SaveRequest request) { return repository.manual(project, model, request, validate); }
            public PinResult pin(PinRequest request) { return repository.pin(project, model, request, validate); }
            public void checkpoint() { repository.checkpoint(project, model, validate); }
        }, clock, nanoTime);
        Objects.requireNonNull(project); Objects.requireNonNull(model); Objects.requireNonNull(repository); Objects.requireNonNull(validate);
    }
    DraftSaveCoordinator(Backend backend, Clock clock, LongSupplier nanoTime) {
        this.backend = Objects.requireNonNull(backend); this.clock = Objects.requireNonNull(clock); this.nanoTime = Objects.requireNonNull(nanoTime);
    }

    public synchronized CompletableFuture<SaveResult> requestManual(SaveRequest request) {
        Objects.requireNonNull(request);
        if (closed) return CompletableFuture.failedFuture(new IllegalStateException("保存协调器已关闭"));
        String key = "SAVE:" + request.save_id();
        Pending old = (Pending) (active != null && active.key().equals(key) ? active : pending.get(key));
        if (old != null) return old.request().equals(request) ? old.future()
                : CompletableFuture.failedFuture(new DraftWorkspaceService.Failure("IDEMPOTENCY_MISMATCH", null));
        var result = new CompletableFuture<SaveResult>(); pending.put(key, new Pending(request, result)); return result;
    }

    public synchronized CompletableFuture<PinResult> requestPin(PinRequest request) {
        Objects.requireNonNull(request);
        if (closed) return CompletableFuture.failedFuture(new IllegalStateException("保存协调器已关闭"));
        String key = "PIN:" + request.pin_id();
        PendingPin old = (PendingPin) (active != null && active.key().equals(key) ? active : pending.get(key));
        if (old != null) return old.request().equals(request) ? old.future()
                : CompletableFuture.failedFuture(new DraftWorkspaceService.Failure("IDEMPOTENCY_MISMATCH", null));
        var result = new CompletableFuture<PinResult>(); pending.put(key, new PendingPin(request, result)); return result;
    }

    public synchronized void start(ScheduledExecutorService executor) {
        if (closed || timer != null) throw new IllegalStateException("保存调度不能重复启动或在关闭后启动");
        timer = Objects.requireNonNull(executor).scheduleWithFixedDelay(this::poll, 0, 100, TimeUnit.MILLISECONDS);
    }

    /** 可控时钟测试直接驱动一次调度；外部 executor 调用同一入口。 */
    public void poll() {
        if (!running.tryLock()) return;
        Task task = null;
        try {
            synchronized (this) {
                if (closed) return;
                if (!pending.isEmpty()) {
                    task = pending.values().iterator().next(); pending.remove(task.key()); active = task; inFlight = task.mode();
                }
            }
            if (task == null) {
                synchronized (this) {
                    if (automaticBlocked || retrying && nanoTime.getAsLong() - retryNanos < 0) return;
                }
                var snapshot = backend.read();
                synchronized (this) {
                    refreshDeadline(snapshot);
                    if (closed || !pending.isEmpty() || deadlineDirty == null || nanoTime.getAsLong() - dueNanos < 0) return;
                    inFlight = "AUTO";
                }
                backend.checkpoint();
            } else {
                task.execute(backend);
            }
            synchronized (this) { failures = 0; retrying = false; automaticBlocked = false; lastError = null; }
        } catch (RuntimeException exception) {
            synchronized (this) {
                String code = exception instanceof DraftJournalRepository.Failure failure ? failure.code()
                        : exception instanceof DraftWorkspaceService.Failure failure ? failure.code() : "PERSISTENCE_FAILED";
                if (!Set.of("INPUT_INVALID", "DRAFT_CONFLICT", "READ_ONLY_REVISION", "RULE_VERSION_CONFLICT", "IDEMPOTENCY_MISMATCH", "PERSISTENCE_FAILED", "DRAFT_RECOVERY_REQUIRED", "NOT_FOUND", "DRAFT_MODE_REQUIRED", "SAVE_VALIDATION_BLOCKED").contains(code)) code = "DRAFT_RECOVERY_REQUIRED";
                if (code.equals("PERSISTENCE_FAILED")) {
                    failures = Math.min(failures + 1, 5);
                    long delay = new long[]{1, 2, 4, 8, 10}[failures - 1];
                    retrying = true; retryNanos = nanoTime.getAsLong() + TimeUnit.SECONDS.toNanos(delay);
                } else if (task == null) automaticBlocked = true;
                lastError = new SaveError(code, "保存未完成：" + code, code.equals("PERSISTENCE_FAILED"));
            }
            if (task != null) task.fail(exception);
        } finally {
            synchronized (this) { active = null; inFlight = "NONE"; }
            running.unlock();
        }
    }

    private void refreshDeadline(DraftJournalRepository.Snapshot snapshot) {
        if (snapshot.dirtySince() == null) { deadlineDirty = null; return; }
        if (snapshot.dirtySince().equals(deadlineDirty)) return;
        deadlineDirty = snapshot.dirtySince(); Instant now = clock.instant(), dirty = Instant.parse(deadlineDirty);
        Instant deadline = Instant.parse(snapshot.deadline());
        long delay = now.isBefore(dirty) || !now.isBefore(deadline) ? 0 : Duration.between(now, deadline).toNanos();
        dueNanos = nanoTime.getAsLong() + delay;
    }

    public SaveState state() {
        var snapshot = backend.read();
        synchronized (this) {
            DraftToken highest = null;
            for (var item : pending.values()) {
                if (!(item instanceof Pending manual)) continue;
                var token = manual.request().target_draft_token();
                if (token.draft_id().equals(snapshot.token().draft_id()) && token.binding_digest().equals(snapshot.token().binding_digest())
                        && token.edit_seq() <= snapshot.token().edit_seq() && (highest == null || token.edit_seq() > highest.edit_seq())) highest = token;
            }
            return new SaveState(snapshot.token(), snapshot.checkpointToken(), snapshot.lastManualRevision(), snapshot.dirtySince(), snapshot.deadline(), inFlight, highest, lastError);
        }
    }

    @Override public synchronized void close() {
        closed = true; if (timer != null) timer.cancel(false);
        for (var item : pending.values()) item.fail(new IllegalStateException("保存协调器已关闭"));
        pending.clear();
    }
}
