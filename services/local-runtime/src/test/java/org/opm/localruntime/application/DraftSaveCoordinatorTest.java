package org.opm.localruntime.application;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.storage.DraftJournalRepository.Snapshot;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class DraftSaveCoordinatorTest {
    private static final Instant ZERO = Instant.parse("2026-09-14T00:00:00Z");
    private static String time(Instant value) { return new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(value); }
    private static DraftToken token(long seq) { return new DraftToken("draft.clock", seq, "a".repeat(64)); }
    private static SaveRequest request(String id, long seq) { return new SaveRequest(id, token(seq), "MANUAL"); }
    private static final class Time extends Clock {
        Instant now = ZERO; final AtomicLong nanos = new AtomicLong();
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
        void advance(long seconds) { now = now.plusSeconds(seconds); nanos.addAndGet(TimeUnit.SECONDS.toNanos(seconds)); }
    }
    /** 纯调度测试替身：SQL 和真实文本由 DraftSaveRepositoryTest 覆盖。 */
    private static final class Backend implements DraftSaveCoordinator.Backend {
        volatile Snapshot snapshot = new Snapshot(token(0), "{}", "b".repeat(64), null, null, token(0), null);
        final List<String> events = new java.util.concurrent.CopyOnWriteArrayList<>();
        Runnable checkpointHook = () -> { }, pinHook = () -> { }; boolean failAuto; int history;
        public Snapshot read() { return snapshot; }
        void edit(long seq, Instant now) {
            String dirty = snapshot.dirtySince() == null ? time(now) : snapshot.dirtySince();
            snapshot = new Snapshot(token(seq), "{}", "b".repeat(64), dirty, time(Instant.parse(dirty).plusSeconds(10)), snapshot.checkpointToken(), snapshot.lastManualRevision());
        }
        public void checkpoint() {
            checkpointHook.run(); events.add(failAuto ? "AUTO_FAILED" : "AUTO");
            if (failAuto) throw new IllegalStateException("存储失败");
            snapshot = new Snapshot(snapshot.token(), "{}", "b".repeat(64), null, null, snapshot.token(), snapshot.lastManualRevision());
        }
        public SaveResult manual(SaveRequest request) {
            events.add(request.save_id()); String revision = "revision." + ++history;
            snapshot = new Snapshot(snapshot.token(), "{}", "b".repeat(64), null, null, snapshot.token(), revision);
            return new SaveResult(request.save_id(), "SAVED", request.target_draft_token(), "checkpoint." + request.target_draft_token().edit_seq(), revision, snapshot.token());
        }
        public PinResult pin(PinRequest request) {
            pinHook.run(); events.add("PIN:" + request.pin_id());
            return new PinResult(request.pin_id(), "revision.pin", request.target_draft_token());
        }
    }
    private DraftSaveCoordinator coordinator(Backend backend, Time time) { return new DraftSaveCoordinator(backend, time, time.nanos::get); }

    @Test void pinAndManualShareFifoButNeverShareIdentityOrPendingManualState() {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now); time.advance(10);
        try (var coordinator = coordinator(backend, time)) {
            var request = new PinRequest("same.id", token(1), "PERMALINK");
            var pin = coordinator.requestPin(request); assertSame(pin, coordinator.requestPin(request));
            assertTrue(coordinator.requestPin(new PinRequest("same.id", token(1), "EXPORT")).isCompletedExceptionally());
            assertNull(coordinator.state().pending_manual_target());
            var manual = coordinator.requestManual(request("same.id", 1));
            coordinator.poll(); assertTrue(pin.isDone()); assertFalse(manual.isDone()); assertNull(coordinator.state().last_manual_revision());
            coordinator.poll(); assertTrue(manual.isDone()); assertEquals(List.of("PIN:same.id", "same.id"), backend.events);
            var pending = coordinator.requestPin(new PinRequest("pin.closed", token(1), "EXPORT"));
            coordinator.close(); assertTrue(pending.isCompletedExceptionally());
            assertTrue(coordinator.requestPin(request).isCompletedExceptionally());
        }
    }

    @Test void activePinCannotBeInterruptedAndPublishesPinStateUntilCompletion() throws Exception {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now); time.advance(10);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        backend.pinHook = () -> { entered.countDown(); try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); } };
        try (var coordinator = coordinator(backend, time); var executor = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var request = new PinRequest("pin.running", token(1), "PERMALINK"); var pin = coordinator.requestPin(request);
            var running = executor.submit(coordinator::poll);
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS)); assertEquals("PIN", coordinator.state().in_flight());
                assertSame(pin, coordinator.requestPin(request));
                var manual = coordinator.requestManual(request("save.queued", 1)); coordinator.poll(); assertFalse(manual.isDone());
                coordinator.close(); assertTrue(manual.isCompletedExceptionally()); assertFalse(pin.isDone());
                release.countDown(); running.get(5, TimeUnit.SECONDS); assertEquals("revision.pin", pin.join().revision_id());
                assertEquals("NONE", coordinator.state().in_flight()); assertEquals(List.of("PIN:pin.running"), backend.events);
            } finally { release.countDown(); }
        }
    }

    @Test void continuousEditingKeepsFirstDeadlineAndSavesThreeTimesInThirtySeconds() {
        var backend = new Backend(); var time = new Time();
        try (var coordinator = coordinator(backend, time)) {
            backend.edit(1, time.now); coordinator.poll();
            long sequence = 1;
            for (int second = 1; second <= 30; second++) {
                time.advance(1);
                // 每轮检查点后立即开始下一批，确保未覆盖编辑的期限不被后续编辑推迟。
                backend.edit(++sequence, time.now); coordinator.poll();
                if (second == 10 || second == 20) { backend.edit(++sequence, time.now); coordinator.poll(); }
                assertEquals(second / 10, backend.events.size());
            }
            assertEquals(List.of("AUTO", "AUTO", "AUTO"), backend.events); assertEquals(0, backend.history);
        }
    }

    @Test void manualWinsOverDueAutoAndRepeatedClickSharesTheSameFuture() {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now);
        try (var coordinator = coordinator(backend, time)) {
            coordinator.poll(); time.advance(10);
            var first = coordinator.requestManual(request("save.one", 1));
            assertSame(first, coordinator.requestManual(request("save.one", 1)));
            assertTrue(coordinator.requestManual(request("save.one", 0)).isCompletedExceptionally());
            assertEquals(token(1), coordinator.state().pending_manual_target());
            coordinator.poll(); coordinator.poll();
            assertEquals("save.one", first.join().save_id()); assertEquals(List.of("save.one"), backend.events);
            assertEquals("NONE", coordinator.state().in_flight()); assertNull(coordinator.state().pending_manual_target());
        }
    }

    @Test void pendingManualKeepsEachExactCapturedTokenInsteadOfPromotingOlderRequests() {
        var backend = new Backend(); var time = new Time(); backend.edit(3, time.now);
        try (var coordinator = coordinator(backend, time)) {
            var one = coordinator.requestManual(request("save.one", 1)); var three = coordinator.requestManual(request("save.three", 3));
            assertEquals(token(3), coordinator.state().pending_manual_target());
            coordinator.poll(); coordinator.poll();
            assertEquals(token(1), one.join().captured_token()); assertEquals(token(3), three.join().captured_token());
            assertEquals(List.of("save.one", "save.three"), backend.events);
        }
    }

    @Test void inFlightAutoFinishesBeforeQueuedManualAndCannotRunTwiceConcurrently() throws Exception {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now); time.advance(10);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        backend.checkpointHook = () -> { entered.countDown(); try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); } };
        try (var coordinator = coordinator(backend, time); var executor = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var automatic = executor.submit(coordinator::poll);
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS)); assertEquals("AUTO", coordinator.state().in_flight());
                var manual = coordinator.requestManual(request("save.after", 1)); coordinator.poll();
                assertFalse(manual.isDone()); assertEquals(token(1), coordinator.state().pending_manual_target());
                release.countDown(); automatic.get(5, TimeUnit.SECONDS); coordinator.poll();
                assertEquals("save.after", manual.join().save_id()); assertEquals(List.of("AUTO", "save.after"), backend.events);
            } finally { release.countDown(); }
        }
    }

    @Test void autoBackoffUsesOneTwoFourEightTenSecondsAndManualBypassesIt() {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now); time.advance(10); backend.failAuto = true;
        try (var coordinator = coordinator(backend, time)) {
            coordinator.poll(); assertEquals(1, backend.events.size());
            int attempts = 1;
            for (int delay : List.of(1, 2, 4, 8, 10, 10)) {
                coordinator.poll(); assertEquals(attempts, backend.events.size());
                time.advance(delay - 1); coordinator.poll(); assertEquals(attempts, backend.events.size());
                time.advance(1); coordinator.poll(); assertEquals(++attempts, backend.events.size());
            }
            assertEquals("PERSISTENCE_FAILED", coordinator.state().last_error().code());
            var manual = coordinator.requestManual(request("save.retry", 1)); coordinator.poll();
            assertTrue(manual.isDone()); assertNull(coordinator.state().last_error());
        }
    }

    @Test void clockJumpsNeverExtendMonotonicDeadlineAndRestartPastDueSavesImmediately() {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now);
        try (var coordinator = coordinator(backend, time)) {
            coordinator.poll(); time.now = ZERO.plusSeconds(86400); time.nanos.set(TimeUnit.SECONDS.toNanos(9)); coordinator.poll(); assertTrue(backend.events.isEmpty());
            time.now = ZERO.minusSeconds(86400); time.nanos.set(TimeUnit.SECONDS.toNanos(10)); coordinator.poll(); assertEquals(List.of("AUTO"), backend.events);
        }
        for (int offset : List.of(-5, 20)) {
            var restarted = new Backend(); var clock = new Time(); restarted.edit(1, ZERO); clock.now = ZERO.plusSeconds(offset);
            try (var coordinator = coordinator(restarted, clock)) { coordinator.poll(); assertEquals(List.of("AUTO"), restarted.events); }
        }
    }

    @Test void recoveryFailurePausesAutoUntilAnExplicitManualOperationSucceeds() {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now); time.advance(10);
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        backend.checkpointHook = () -> { attempts.incrementAndGet(); throw new DraftWorkspaceService.Failure("DRAFT_RECOVERY_REQUIRED", null); };
        try (var coordinator = coordinator(backend, time)) {
            coordinator.poll(); assertEquals(1, attempts.get()); assertFalse(coordinator.state().last_error().retryable());
            time.advance(100); coordinator.poll(); assertEquals(1, attempts.get());
            var manual = coordinator.requestManual(request("save.recovered", 1)); coordinator.poll();
            assertTrue(manual.isDone()); assertNull(coordinator.state().last_error());
        }
    }

    @Test void executorRunsCoreAndCloseCancelsQueuedWorkWithoutClosingTheHostExecutor() throws Exception {
        var backend = new Backend(); var time = new Time(); backend.edit(1, time.now); time.advance(11);
        var reached = new CountDownLatch(1); backend.checkpointHook = reached::countDown;
        try (var executor = java.util.concurrent.Executors.newSingleThreadScheduledExecutor()) {
            var coordinator = coordinator(backend, time); coordinator.start(executor);
            try { assertTrue(reached.await(3, TimeUnit.SECONDS)); }
            finally { coordinator.close(); }
            assertFalse(executor.isShutdown()); assertTrue(coordinator.requestManual(request("save.closed", 1)).isCompletedExceptionally());
        }
        var pendingBackend = new Backend(); var pendingTime = new Time();
        var coordinator = coordinator(pendingBackend, pendingTime); var pending = coordinator.requestManual(request("save.pending", 0));
        coordinator.close(); coordinator.poll(); assertTrue(pending.isCompletedExceptionally()); assertTrue(pendingBackend.events.isEmpty());
    }
}
