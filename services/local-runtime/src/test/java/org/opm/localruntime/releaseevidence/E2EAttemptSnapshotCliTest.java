package org.opm.localruntime.releaseevidence;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class E2EAttemptSnapshotCliTest {

    @TempDir
    Path temporary;

    @Test
    void acceptsOnlyTheFrozenAbsoluteArgumentSet() {
        Path attempt = temporary.resolve("attempt").toAbsolutePath();
        E2EAttemptSnapshotCli.Arguments arguments = E2EAttemptSnapshotCli.Arguments.parse(arguments(attempt));

        assertEquals(attempt.resolve("storage"), arguments.storage());
        assertEquals("project.snapshot", arguments.projectId());
        assertEquals("model.snapshot", arguments.modelId());
        assertEquals("context.snapshot", arguments.contextId());
        assertEquals("revision.snapshot", arguments.revisionId());
        assertEquals(attempt.resolve("profile/assets"), arguments.profileAssetRoot());
    }

    @Test
    void rejectsWrongGuardRelativePathDuplicateAndUnknownOption() {
        Path attempt = temporary.resolve("attempt").toAbsolutePath();
        String[] wrongGuard = arguments(attempt);
        wrongGuard[1] = "WRONG";
        assertEquals(2, E2EAttemptSnapshotCli.run(wrongGuard));

        String[] relative = arguments(attempt);
        relative[3] = "relative/storage";
        assertEquals(2, E2EAttemptSnapshotCli.run(relative));

        String[] duplicate = arguments(attempt);
        duplicate[2] = "--guard";
        assertEquals(2, E2EAttemptSnapshotCli.run(duplicate));

        String[] unknown = arguments(attempt);
        unknown[2] = "--unknown";
        assertEquals(2, E2EAttemptSnapshotCli.run(unknown));
    }

    @Test
    void rejectsClasspathAndOrdinaryJarCodeSources() throws Exception {
        Path jar = temporary.resolve("local-runtime.jar");
        Files.writeString(jar, "not-a-runtime");
        assertThrows(RuntimeException.class,
                () -> E2EFixtureMaterializerCli.resolveNestedRuntimeJarCodeSource(jar.toUri().toString(), jar));
        assertThrows(RuntimeException.class,
                () -> E2EFixtureMaterializerCli.resolveNestedRuntimeJarCodeSource("jar:" + jar.toUri() + "!/BOOT-INF/classes/", jar));
    }

    @Test
    void transactionSnapshotAcceptsOnlyItsFrozenAbsoluteArgumentSet() {
        Path attempt = temporary.resolve("attempt").toAbsolutePath();
        E2ETransactionSnapshotCli.Arguments arguments = E2ETransactionSnapshotCli.Arguments.parse(transactionArguments(attempt));

        assertEquals(attempt.resolve("storage"), arguments.storage());
        assertEquals("project.snapshot", arguments.projectId());
        assertEquals("model.snapshot", arguments.modelId());
        assertEquals("revision.snapshot.before", arguments.beforeRevisionId());
        assertEquals("revision.snapshot.after", arguments.afterRevisionId());

        String[] wrongGuard = transactionArguments(attempt);
        wrongGuard[1] = "WRONG";
        assertEquals(2, E2ETransactionSnapshotCli.run(wrongGuard));

        String[] relative = transactionArguments(attempt);
        relative[3] = "relative/storage";
        assertEquals(2, E2ETransactionSnapshotCli.run(relative));
    }

    private String[] arguments(Path attempt) {
        return new String[] {
                "--guard", "RELEASE_E2E_SNAPSHOT_ONLY",
                "--storage", attempt.resolve("storage").toString(),
                "--project-id", "project.snapshot",
                "--model-id", "model.snapshot",
                "--context-id", "context.snapshot",
                "--revision-id", "revision.snapshot",
                "--profile-asset-root", attempt.resolve("profile/assets").toString(),
                "--fixture-materialization", attempt.resolve("fixture-materialization.json").toString(),
                "--projection-response", attempt.resolve("api-exchanges/projection.response.json").toString()
        };
    }

    private String[] transactionArguments(Path attempt) {
        return new String[] {
                "--guard", "RELEASE_E2E_TRANSACTION_SNAPSHOT_ONLY",
                "--storage", attempt.resolve("storage").toString(),
                "--project-id", "project.snapshot",
                "--model-id", "model.snapshot",
                "--before-revision-id", "revision.snapshot.before",
                "--after-revision-id", "revision.snapshot.after",
                "--fixture-materialization", attempt.resolve("fixture-materialization.json").toString()
        };
    }
}
