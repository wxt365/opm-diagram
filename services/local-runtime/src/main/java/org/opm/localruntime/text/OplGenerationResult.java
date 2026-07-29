package org.opm.localruntime.text;

import java.util.List;
import java.util.Objects;

public record OplGenerationResult(OplTextArtifact artifact, List<OplTextTrace> traces) {

    public OplGenerationResult {
        artifact = Objects.requireNonNull(artifact, "artifact must not be null");
        traces = List.copyOf(Objects.requireNonNull(traces, "traces must not be null"));
    }
}
