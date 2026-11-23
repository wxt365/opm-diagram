package org.opm.localruntime.desktop;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.nio.file.Files;
import java.io.ByteArrayInputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.sql.DriverManager;
import org.opm.localruntime.storage.SqliteStore;

class DesktopProcessProtocolTest {
    @TempDir Path root;
    @Test void readyContainsActualIdentityAndRejectsMismatchedName() throws Exception {
        String nonce = UUID.randomUUID().toString(); Path target = root.toRealPath().resolve("runtime." + nonce + ".json");
        DesktopProcessProtocol.ready(target, nonce, 12345);
        String value = Files.readString(target);
        assertTrue(value.contains(nonce)); assertTrue(value.contains("12345"));
        assertTrue(value.contains(String.valueOf(ProcessHandle.current().pid())));
        assertThrows(IllegalArgumentException.class, () -> DesktopProcessProtocol.ready(root.resolve("wrong.json"), nonce, 12345));
    }
    @Test void eofAndExplicitQuitCloseOnce() throws Exception {
        for (String input : new String[] { "", "hhqh" }) {
            var latch = new CountDownLatch(1);
            try (var monitor = DesktopProcessProtocol.watch(new ByteArrayInputStream(input.getBytes()), latch::countDown, Duration.ofSeconds(10))) {
                assertTrue(latch.await(2, TimeUnit.SECONDS));
            }
        }
    }
    @Test void silentParentTriggersWatchdog() throws Exception {
        var latch = new CountDownLatch(1);
        try (var input = new PipedInputStream(); var output = new PipedOutputStream(input);
             var monitor = DesktopProcessProtocol.watch(input, latch::countDown, Duration.ofMillis(100))) {
            assertTrue(latch.await(3, TimeUnit.SECONDS));
        }
    }
    @Test void verifierReadsRealSqliteAndRejectsCorruption() throws Exception {
        Path data = Files.createDirectories(root.resolve("runtime-data")), database = data.resolve("catalog.db");
        var store = new SqliteStore(data); store.migrate();
        try (var connection = store.projectConnection("project.verifier"); var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE example(id TEXT CHECK(id = project_scope()))");
            statement.execute("INSERT INTO example VALUES ('project.verifier')");
        }
        DesktopBackupVerifier.verify(root);
        Files.writeString(database, "invalid database");
        assertThrows(Exception.class, () -> DesktopBackupVerifier.verify(root));
    }
}
