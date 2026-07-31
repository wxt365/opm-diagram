package org.opm.localruntime.compatibility;

import java.nio.file.Files;
import java.nio.file.Path;

/** Compatibility replay 的无容器命令行入口。 */
public final class RevisionCompatibilityCli {

    private static final Path DEFAULT_MANIFEST = Path.of("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/compatibility/opm-revision-compatibility-manifest.json");
    private static final Path DEFAULT_REPORT = Path.of("services/local-runtime/target/compatibility-replay/opm-revision-compatibility-report.json");

    private RevisionCompatibilityCli() { }

    public static void main(String[] args) {
        int exitCode = run(args);
        if (exitCode != 0) System.exit(exitCode);
    }

    static int run(String[] args) {
        Path manifest = DEFAULT_MANIFEST;
        Path report = DEFAULT_REPORT;
        for (int index = 0; index < args.length; index++) {
            if ("--manifest".equals(args[index]) && index + 1 < args.length) manifest = Path.of(args[++index]);
            else if ("--report".equals(args[index]) && index + 1 < args.length) report = Path.of(args[++index]);
            else return 2;
        }
        try {
            manifest = repositoryPath(manifest);
            report = repositoryPath(report);
            RevisionCompatibilityReportWriter.Report result = new RevisionCompatibilityRunner().run(manifest, report.toAbsolutePath().normalize().getParent().resolve("work"));
            new RevisionCompatibilityReportWriter().write(report, result);
            long pass = result.cases().stream().filter(item -> item.status() == RevisionCompatibilityReportWriter.Status.PASS_MATCHED).count();
            long blocked = result.cases().stream().filter(item -> item.status() == RevisionCompatibilityReportWriter.Status.BLOCKED_MATCHED).count();
            long failed = result.cases().stream().filter(item -> item.status() == RevisionCompatibilityReportWriter.Status.FAILED).count();
            System.out.printf("Revision compatibility replay: cases=%d pass=%d blocked=%d failed=%d%n", result.cases().size(), pass, blocked, failed);
            return pass == 6 && blocked == 7 && failed == 0 ? 0 : 3;
        } catch (Exception exception) {
            System.err.println("Revision compatibility replay failed: " + exception.getMessage());
            return 4;
        }
    }

    private static Path repositoryPath(Path path) {
        if (path.isAbsolute()) return path.normalize();
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isDirectory(current.resolve("packages")) && Files.isRegularFile(current.resolve("package.json"))) return current.resolve(path).normalize();
            current = current.getParent();
        }
        throw new IllegalStateException("Cannot locate repository root");
    }
}
