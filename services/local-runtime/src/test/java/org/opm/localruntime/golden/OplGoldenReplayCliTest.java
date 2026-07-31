package org.opm.localruntime.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OplGoldenReplayCliTest {

    @Test
    void writesTheReplayReportForTheVersionedManifest() throws Exception {
        Path manifest = repositoryFile("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json");
        Path report = Files.createTempDirectory("opm-golden-cli-").resolve("report.json");

        assertEquals(0, OplGoldenReplayCli.run(new String[] {"--manifest", manifest.toString(), "--report", report.toString()}));
        assertTrue(Files.isRegularFile(report));
        ObjectMapper mapper = new ObjectMapper();
        JsonNode value = mapper.readTree(Files.readString(report));
        assertEquals(mapper.readTree(Files.readString(manifest)).required("cases").size(), value.required("case_count").asInt());
        assertEquals(0, value.required("failed_count").asInt());
    }

    private Path repositoryFile(String relativePath) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve(relativePath);
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Repository file is not available: " + relativePath);
    }
}
