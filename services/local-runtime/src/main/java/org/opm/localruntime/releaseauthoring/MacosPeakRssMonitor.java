package org.opm.localruntime.releaseauthoring;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** 使用 macOS ps 采样当前 JVM 的驻留集大小，避免把 JVM 内存指标误作 RSS。 */
final class MacosPeakRssMonitor implements PeakRssMonitor {

    private static final long SAMPLE_INTERVAL_MILLIS = 250L;
    private static final long RETRY_BACKOFF_MILLIS = 250L;
    private static final int MAX_SAMPLE_ATTEMPTS = 3;
    private final long pid;
    private final AtomicBoolean running = new AtomicBoolean(true);
    private volatile long peakBytes;
    private volatile GoldenFixtureMaterializationException failure;
    private final Thread sampler;

    private MacosPeakRssMonitor(long pid) throws GoldenFixtureMaterializationException {
        if (!"Mac OS X".equals(System.getProperty("os.name"))) {
            throw failure("RSS probe requires the frozen macOS reference machine.", null);
        }
        this.pid = pid;
        sample();
        this.sampler = Thread.ofPlatform().daemon().name("gfm-rss-monitor").start(() -> {
            while (running.get()) {
                try {
                    Thread.sleep(SAMPLE_INTERVAL_MILLIS);
                    sample();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        });
    }

    static MacosPeakRssMonitor start() throws GoldenFixtureMaterializationException {
        return new MacosPeakRssMonitor(ProcessHandle.current().pid());
    }

    public long peakBytes() throws GoldenFixtureMaterializationException {
        sample();
        if (failure != null) throw failure;
        return peakBytes;
    }

    private void sample() {
        if (failure != null) return;
        Exception lastFailure = null;
        for (int attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
            try {
                sampleOnce();
                return;
            } catch (Exception exception) {
                lastFailure = exception;
                if (attempt + 1 < MAX_SAMPLE_ATTEMPTS) {
                    try {
                        Thread.sleep(RETRY_BACKOFF_MILLIS);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        lastFailure = interrupted;
                        break;
                    }
                }
            }
        }
        failure = failure("RSS probe failed.", lastFailure);
    }

    private void sampleOnce() throws Exception {
        Process process = new ProcessBuilder("/bin/ps", "-o", "rss=", "-p", Long.toString(pid))
                .redirectErrorStream(true)
                .start();
        if (!process.waitFor(1, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("RSS probe timed out.");
        }
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        if (process.exitValue() != 0 || !output.matches("[1-9][0-9]*")) {
            throw new IllegalStateException("RSS probe output is invalid.");
        }
        long bytes = Math.multiplyExact(Long.parseLong(output), 1024L);
        peakBytes = Math.max(peakBytes, bytes);
    }

    private static GoldenFixtureMaterializationException failure(String message, Exception cause) {
        return new GoldenFixtureMaterializationException("GFM_PERFORMANCE_PROBE_FAILED", message, cause);
    }

    @Override
    public void close() {
        running.set(false);
        sampler.interrupt();
    }
}

interface PeakRssMonitor extends AutoCloseable {
    long peakBytes() throws GoldenFixtureMaterializationException;
    @Override void close();
}

@FunctionalInterface
interface PeakRssMonitorFactory {
    PeakRssMonitor start() throws GoldenFixtureMaterializationException;
}
