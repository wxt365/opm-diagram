package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

/** 浏览器测试仅接受全新临时目录；不用生产 API 激活模型。 */
class DraftBrowserFixtureTest {
    @TempDir Path temporary;
    @Test void prepareBrowserDatabase() throws Exception {
        String configured = System.getProperty("opm.browser.fixture.root");
        Path storage = configured == null ? temporary.resolve("browser") : Path.of(configured).toAbsolutePath().normalize();
        if (configured != null) {
            assertTrue(storage.startsWith(Path.of("/private/tmp")), "只允许独立临时目录");
            assertTrue(storage.getFileName().toString().startsWith("opm-hs03b-"));
            assertFalse(Files.exists(storage), "禁止覆盖既有测试或用户数据");
        }
        Path db = create(storage, true, document -> addOwnedContext(document, "context.browser.second", "MODEL_VIEW"));
        Flyway.configure().dataSource(SqliteConnectionFactory.create(db)).locations(
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-checkpoint"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-pin"))
                .target("5").mixed(true).load().migrate();
        assertEquals(1, count(db, "revision_document"));
        assertEquals(0, count(db, "draft_savepoint"));
        assertEquals(0, count(db, "draft_journal"));
        System.out.println("浏览器测试库：" + db);
    }
}
