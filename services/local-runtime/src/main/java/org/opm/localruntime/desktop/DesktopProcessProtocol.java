package org.opm.localruntime.desktop;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** 仅用于桌面受管进程，不增加 HTTP 关闭接口。 */
public final class DesktopProcessProtocol {
    private DesktopProcessProtocol() { }

    public static void ready(Path target, String nonce, int port) throws Exception {
        if (nonce == null || !nonce.matches("[a-f0-9-]{36}") || port < 1 || port > 65535
                || !target.isAbsolute() || !target.getFileName().toString().equals("runtime." + nonce + ".json")
                || Files.isSymbolicLink(target) || !target.getParent().equals(target.getParent().toRealPath())) {
            throw new IllegalArgumentException("桌面启动回执参数无效");
        }
        Path temporary = Files.createTempFile(target.getParent(), ".ready-", ".tmp");
        try {
            if (Files.getFileStore(temporary).supportsFileAttributeView("posix"))
                Files.setPosixFilePermissions(temporary, PosixFilePermissions.fromString("rw-------"));
            new ObjectMapper().writeValue(temporary.toFile(), Map.of("protocol", 1, "component", "runtime",
                    "nonce", nonce, "pid", ProcessHandle.current().pid(), "port", port));
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
        } finally { Files.deleteIfExists(temporary); }
    }

    public static AutoCloseable watch(InputStream input, Runnable close, Duration timeout) {
        AtomicBoolean stopped = new AtomicBoolean();
        AtomicLong activity = new AtomicLong(System.nanoTime());
        var timer = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "desktop-parent-watchdog"); thread.setDaemon(true); return thread;
        });
        Runnable stop = () -> { if (stopped.compareAndSet(false, true)) { timer.shutdownNow(); close.run(); } };
        Thread reader = new Thread(() -> {
            try {
                for (int value; (value = input.read()) != -1;) {
                    if (value == 'q') { stop.run(); return; }
                    if (value == 'h') activity.set(System.nanoTime());
                }
            } catch (Exception ignored) { /* 管道断开与父进程退出均执行正常关闭。 */ }
            stop.run();
        }, "desktop-parent-input");
        timer.scheduleAtFixedRate(() -> {
            if (System.nanoTime() - activity.get() > timeout.toNanos()) stop.run();
        }, 1, 1, TimeUnit.SECONDS);
        reader.setDaemon(true); reader.start();
        return () -> { stopped.set(true); timer.shutdownNow(); };
    }
}
