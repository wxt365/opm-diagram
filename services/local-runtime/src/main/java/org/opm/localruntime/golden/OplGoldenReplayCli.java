package org.opm.localruntime.golden;

import java.nio.file.Path;
import java.nio.file.Files;

/** Golden replay 的无容器命令行入口。 */
public final class OplGoldenReplayCli {

    private static final Path DEFAULT_MANIFEST = Path.of("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json");
    private static final Path DEFAULT_REPORT = Path.of("services/local-runtime/target/golden-replay/opm-opl-golden-replay-report.json");

    private OplGoldenReplayCli() { }

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
            else {
                System.err.println("Usage: OplGoldenReplayCli [--manifest <path>] [--report <path>]");
                return 2;
            }
        }
        try {
            manifest = repositoryPath(manifest);
            report = repositoryPath(report);
            OplGoldenReplayReportWriter.Report result = new OplGoldenReplayRunner().run(manifest, report.toAbsolutePath().normalize().getParent().resolve("work"));
            new OplGoldenReplayReportWriter().write(report, result);
            System.out.printf("OPL Golden replay: cases=%d pass=%d blocked=%d failed=%d%n", result.cases().size(),
                    result.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.PASS_MATCHED).count(),
                    result.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.BLOCKED_MATCHED).count(),
                    result.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.FAILED).count());
            return result.cases().stream().anyMatch(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.FAILED) ? 3 : 0;
        } catch (Exception exception) {
            System.err.println("OPL Golden replay failed: " + exception.getMessage());
            return 4;
        }
    }

    private static Path repositoryPath(Path path) {
        if (path.isAbsolute()) return path.normalize();
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isDirectory(current.resolve("packages")) && Files.isRegularFile(current.resolve("package.json"))) {
                return current.resolve(path).normalize();
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Cannot locate repository root for Golden replay");
    }
}
